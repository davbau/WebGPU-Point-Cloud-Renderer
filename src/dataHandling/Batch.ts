import {mat4, vec2, vec3, vec4} from "webgpu-matrix";
import {u_int32} from "../types/c_equivalents";
import {Util} from "../utils/util";

type UniformType = {
    // origin of the bounding box, will be padded to vec4 = 16 bytes
    origin: vec3.default;
    // size of the bounding box, will be padded to vec4 = 16 bytes
    size: vec3.default;
    // 0: coarse, 1: medium, 2: fine. Won't be padded.
    renderMode: u_int32;
}

/**
 * One Batch with a set number of points.
 * Used in the {@Link BatchHandler} container class.
 */
export class Batch {
    /**
     * Bounding box of the batch. The bounding box is an array of 6 numbers: [minX, minY, minZ, maxX, maxY, maxZ].
     * @private
     */
    private _boundingBox: number[];
    /**
     * Size of the batch in 3D space. The size is an array of 3 numbers: [sizeX, sizeY, sizeZ].
     * @private
     */
    private _size: number[];
    /**
     * The number of points in the batch.
     * @private
     */
    private _filledSize: number;
    /**
     * The maximum number of points in the batch.
     * @private
     */
    private batchSize: number;

    /**
     * The amount of bytes in the buffer that can be loaded into the Batch. The batch itself will split this into the different buffers.
     * @private
     */
    private _bufferSize: number;

    /**
     * The screen size in pixels.
     * @private
     */
    private _screenSize: vec2.default;

    /**
     * The id of the batch.
     * @private
     */
    private _id: number;

    private lastUsedMVP: Float32Array;
    private transformedCornersCache: Float32Array;


    /** The GPU buffer containing the points of the batch. The course buffer contains the 10 most significant bits of x, y and z as distances from the {@link _boundingBox} origin. **/
    private gpuBuffer_coarse: GPUBuffer;
    /** The GPU buffer containing the points of the batch. The medium buffer contains the 10th to 20th most significant bits of x, y and z as distances from the {@link _boundingBox} origin. **/
    private gpuBuffer_medium: GPUBuffer;
    /** The GPU buffer containing the points of the batch. The fine buffer contains the 20th to 30th most significant bits of x, y and z as distances from the {@link _boundingBox} origin. **/
    private gpuBuffer_fine: GPUBuffer;
    /** The GPU buffer containing the colors for the points of the batch. **/
    private gpuBuffer_color: GPUBuffer;

    /** The Host buffer containing the points of the batch. The course buffer contains the 10 most significant bits of x, y and z as distances from the {@link _boundingBox} origin. **/
    private hostBuffer_coarse?: Uint32Array;
    /** The Host buffer containing the points of the batch. The medium buffer contains the 10th to 20th most significant bits of x, y and z as distances from the {@link _boundingBox} origin. **/
    private hostBuffer_medium?: Uint32Array;
    /** The Host buffer containing the points of the batch. The fine buffer contains the 20th to 30th most significant bits of x, y and z as distances from the {@link _boundingBox} origin. **/
    private hostBuffer_fine?: Uint32Array;
    /** The Host buffer containing the colors for the points of the batch. **/
    private hostBuffer_color?: Uint32Array;

    /**
     * Bind groups for the depth render passes. One bind group per different shader.
     * This is initialised when the buffer is written to the GPU.
     *
     * Index 0: coarse
     * Index 1: medium
     * Index 2: fine
     *
     * @private
     */
    private bindGroups_depth?: GPUBindGroup[];
    /**
     * Bind groups for the render passes. One bind group per different shader.
     * This is initialised when the buffer is written to the GPU.
     *
     * Index 0: coarse
     * Index 1: medium
     * Index 2: fine
     *
     * @private
     */
    private bindGroups_rendering?: GPUBindGroup[];

    private buffersReadyToWrite: boolean;
    private buffersInFlight: boolean;
    private buffersWrittenToGPU: boolean;

    private _compute_depth_shader_bindGroupLayouts: GPUBindGroupLayout[];
    private _compute_shader_bindGroupLayouts: GPUBindGroupLayout[];

    private _uniformBuffer: GPUBuffer;
    private _depthBuffer: GPUBuffer;
    private _frameBuffer: GPUBuffer;

    private _device: GPUDevice;

    constructor(
        device: GPUDevice,
        uniformBuffer: GPUBuffer,
        depthBuffer: GPUBuffer,
        frameBuffer: GPUBuffer,
        compute_depth_shader_bindGroupLayouts: GPUBindGroupLayout[],
        compute_shader_bindGroupLayouts: GPUBindGroupLayout[],
        bufferSize: number,
        screenSize: vec2.default,
        id: number
    ) {
        console.log("Creating new batch with size", bufferSize);
        // Number of this Batch for debugging
        this._id = id;
        this._device = device;
        this._uniformBuffer = uniformBuffer;
        this._depthBuffer = depthBuffer;
        this._frameBuffer = frameBuffer;
        this._compute_depth_shader_bindGroupLayouts = compute_depth_shader_bindGroupLayouts;
        this._compute_shader_bindGroupLayouts = compute_shader_bindGroupLayouts;
        this._bufferSize = bufferSize;
        this._screenSize = screenSize

        this.batchSize = bufferSize / 16;

        this.gpuBuffer_coarse = this.makeGPUBuffer(this.batchSize, "coarse");
        this.gpuBuffer_medium = this.makeGPUBuffer(this.batchSize, "medium");
        this.gpuBuffer_fine = this.makeGPUBuffer(this.batchSize, "fine");
        this.gpuBuffer_color = this.makeGPUBuffer(this.batchSize, "color");

        this.hostBuffer_coarse = new Uint32Array(this.batchSize);
        this.hostBuffer_medium = new Uint32Array(this.batchSize);
        this.hostBuffer_fine = new Uint32Array(this.batchSize);
        this.hostBuffer_color = new Uint32Array(this.batchSize);

        this.buffersReadyToWrite = false;
        this.buffersInFlight = false;
        this.buffersWrittenToGPU = false;

        const b0 = Infinity;
        this._boundingBox = [b0, b0, b0, -b0, -b0, -b0];
        this._size = [0, 0, 0];
        this._filledSize = 0;

        this.lastUsedMVP = new Float32Array(16);
        this.transformedCornersCache = new Float32Array(24);
    }

    /**
     * Create the GPU Buffer to hold the loaded points.
     * @param number_of_points the number of points in the batch. This controls the size of the buffer using the size per element.
     * @param label label of the buffer used for debugging.
     * @private
     */
    private makeGPUBuffer(number_of_points: number, label: string) {
        return this._device.createBuffer({
            label: label,
            size: number_of_points * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Load points into the batch. Each point has to be processed into a fine, medium and coarse representation and then loaded into the corresponding GPU buffer.
     * The bounding box {@link _boundingBox} and the size of the batch are also updated.
     * @param data The points to load in the format: [x1, y1, z1, c1, x2, y2, z2, c2, ...]
     * x, y, z are the coordinates of the point and c is the color of the point.
     * x, y, z are f32 and c is an uint32.
     */
    async loadData(data: ArrayBuffer): Promise<void> {
        const numPoints = data.byteLength / 16;
        const numPointsToLoad = Math.min(numPoints, this.batchSize - this._filledSize);

        // find bounding box
        const boundingBoxFound = this.findBoundingBox(data, numPointsToLoad);

        // Process the points and load them into the host buffers.
        const courseView = new DataView(this.hostBuffer_coarse!.buffer);
        const mediumView = new DataView(this.hostBuffer_medium!.buffer);
        const fineView = new DataView(this.hostBuffer_fine!.buffer);
        const colorView = new DataView(this.hostBuffer_color!.buffer);

        await boundingBoxFound;

        const boxSize = this.getBoxSize();
        const origin = this.getOrigin();

        // print the bounding box
        // console.log("Bounding box: ", this._boundingBox);
        // console.log("Size: ", boxSize);
        // console.log("Origin: ", origin);

        const factor = 2 ** 30; // 0b0100_0000_0000_0000_0000_0000_0000_0000
        const bitmask30 = factor - 1; // 0b0011_1111_1111_1111_1111_1111_1111_1111

        const dataView = new DataView(data);
        for (let i = 0; i < numPointsToLoad; i++) {
            const x = dataView.getFloat32(i * 16, true);
            const y = dataView.getFloat32(i * 16 + 4, true);
            const z = dataView.getFloat32(i * 16 + 8, true);
            const c = dataView.getUint32(i * 16 + 12, true);

            // relate to bounding box origin
            let xDist = x - origin[0];
            let yDist = y - origin[1];
            let zDist = z - origin[2];

            // transform to [0, 1]
            if (xDist !== 0) {
                xDist = xDist / boxSize[0];
            }
            if (yDist !== 0) {
                yDist = yDist / boxSize[1];
            }
            if (zDist !== 0) {
                zDist = zDist / boxSize[2];
            }

            // transform to [0, 2^32]
            xDist = Math.floor(xDist * bitmask30);
            yDist = Math.floor(yDist * bitmask30);
            zDist = Math.floor(zDist * bitmask30);

            // read out coarse, medium and fine
            const coarseX = (xDist >> 20) & 0x3FF;
            const coarseY = (yDist >> 20) & 0x3FF;
            const coarseZ = (zDist >> 20) & 0x3FF;
            courseView.setUint32(i * 4, (coarseX << 20) | (coarseY << 10) | coarseZ, true);

            const mediumX = (xDist >> 10) & 0x3FF;
            const mediumY = (yDist >> 10) & 0x3FF;
            const mediumZ = (zDist >> 10) & 0x3FF;
            mediumView.setUint32(i * 4, (mediumX << 20) | (mediumY << 10) | mediumZ, true);

            const fineX = (xDist >> 0) & 0x3FF;
            const fineY = (yDist >> 0) & 0x3FF;
            const fineZ = (zDist >> 0) & 0x3FF;
            fineView.setUint32(i * 4, (fineX << 20) | (fineY << 10) | fineZ, true);

            // color[i] = c;
            colorView.setUint32(i * 4, c, true);
        }

        // Buffer is ready to be written to the GPU. Can be done in the render loop so only one Buffer is written per frame.
        this.buffersReadyToWrite = true;

        this._filledSize += numPointsToLoad;
        return;
    }

    /**
     * Write the data of the buffer to the GPU. This function exists so the load of transferring data to the GPU can be spread out over multiple frames.
     * The host buffer may be destroyed after it is copied to the GPU buffer to save memory.
     *
     * @param deleteHostBuffer_ifFull If true, the host buffer will be destroyed if it is full.
     */
    async writeDataToGPUBuffer(deleteHostBuffer_ifFull: boolean = false) {
        if (this.buffersReadyToWrite && !this.buffersInFlight) {
            this._device.queue.writeBuffer(this.gpuBuffer_coarse, 0, this.hostBuffer_coarse!.buffer, 0, this.hostBuffer_coarse!.byteLength);
            this._device.queue.writeBuffer(this.gpuBuffer_medium, 0, this.hostBuffer_medium!.buffer, 0, this.hostBuffer_medium!.byteLength);
            this._device.queue.writeBuffer(this.gpuBuffer_fine, 0, this.hostBuffer_fine!.buffer, 0, this.hostBuffer_fine!.byteLength);
            this._device.queue.writeBuffer(this.gpuBuffer_color, 0, this.hostBuffer_color!.buffer, 0, this.hostBuffer_color!.byteLength);
            this.buffersInFlight = true;

            this.create_bindGroups();
            this._device.queue.onSubmittedWorkDone().then(() => {
                // finished writing to GPU
                this.buffersReadyToWrite = false;
                this.buffersWrittenToGPU = true;
                this.buffersInFlight = false;
                console.log(`Finished writing ${this.gpuBuffer_coarse.size * 4} bytes of data to GPU buffer for Batch: `, this._id);

                if (deleteHostBuffer_ifFull && this.isFull()) {
                    this.destroyHostBuffers();
                }
            }).catch((error) => {
                console.error("Error writing data to GPU buffer for Batch: ", this._id, error);
            });
        }
    }

    /**
     * Get the origin of the batch in 3D space. The origin is an array of 3 numbers: [originX, originY, originZ].
     */
    getOrigin() {
        return [
            this._boundingBox[0],
            this._boundingBox[1],
            this._boundingBox[2]
        ]
    }

    /**
     * Get the size of the batch in 3D space. The size is an array of 3 numbers: [sizeX, sizeY, sizeZ].
     */
    getBoxSize() {
        return this._size;
    }

    getCoarseGPUBuffer() {
        return this.gpuBuffer_coarse;
    }

    getMediumGPUBuffer() {
        return this.gpuBuffer_medium;
    }

    getFineGPUBuffer() {
        return this.gpuBuffer_fine;
    }

    getColorGPUBuffer() {
        return this.gpuBuffer_color;
    }

    /**
     * Destroy the GPU buffers of the batch.
     */
    destroyGPUBuffers() {
        this.gpuBuffer_coarse.destroy();
        this.gpuBuffer_medium.destroy();
        this.gpuBuffer_fine.destroy();
        this.gpuBuffer_color.destroy();
    }

    /**
     * Destroy the host buffers of the batch.
     */
    destroyHostBuffers() {
        delete this.hostBuffer_coarse;
        delete this.hostBuffer_medium;
        delete this.hostBuffer_fine;
        delete this.hostBuffer_color;
        console.log("Deleted host buffers for batch: ", this._id, "\ttotaling", this._bufferSize * 4 * 4 / (1024 ** 2), "MB");
    }

    /**
     * Find the bounding box of the batch. The bounding box is an array of 6 numbers: [minX, minY, minZ, maxX, maxY, maxZ].
     * @param data The data to find the bounding box of.
     * @param numPointsToLoad The number of points to load.
     * @private
     */
    private async findBoundingBox(data: ArrayBuffer, numPointsToLoad: number): Promise<void> {
        const dataView = new DataView(data);
        for (let i = 0; i < numPointsToLoad; i++) {
            const x = dataView.getFloat32(i * 16, true);
            const y = dataView.getFloat32(i * 16 + 4, true);
            const z = dataView.getFloat32(i * 16 + 8, true);

            if (this._boundingBox[0] > x) this._boundingBox[0] = x;
            if (this._boundingBox[1] > y) this._boundingBox[1] = y;
            if (this._boundingBox[2] > z) this._boundingBox[2] = z;

            if (this._boundingBox[3] < x) this._boundingBox[3] = x;
            if (this._boundingBox[4] < y) this._boundingBox[4] = y;
            if (this._boundingBox[5] < z) this._boundingBox[5] = z;
        }

        this._size = [
            (this._boundingBox[3] - this._boundingBox[0]),
            (this._boundingBox[4] - this._boundingBox[1]),
            (this._boundingBox[5] - this._boundingBox[2])
        ];
    }

    /**
     * Write the uniform data to the uniform buffer. The render mode is used to determine the level of detail to render.
     * This function should be called before rendering the batch.
     * @param renderMode 0: coarse, 1: medium, 2: fine.
     */
    getUniformData(renderMode: u_int32) {
        // Update the uniform data
        const origin = this.getOrigin();
        const size = this.getBoxSize();
        const uniformData: UniformType = {
            origin: vec4.fromValues(origin[0], origin[1], origin[2], 0),
            size: vec4.fromValues(size[0], size[1], size[2], 0),
            renderMode: renderMode,
        };

        const uniformArray = new Float32Array(4 * 2 + 1);
        const uniformArrayView = new DataView(uniformArray.buffer);
        uniformArrayView.setFloat32(0, uniformData.origin[0], true);
        uniformArrayView.setFloat32(4, uniformData.origin[1], true);
        uniformArrayView.setFloat32(8, uniformData.origin[2], true);

        uniformArrayView.setFloat32(16, uniformData.size[0], true);
        uniformArrayView.setFloat32(20, uniformData.size[1], true);
        uniformArrayView.setFloat32(24, uniformData.size[2], true);

        uniformArrayView.setUint32(32, uniformData.renderMode, true);
    }

    /**
     * Transform the eight corners of the bounding box into screen space. The corners are transformed by the model view projection matrix.
     * @param mvp The model view projection matrix.
     * @returns The transformed bounding box corners. The format is [x1, y1, z1, x2, y2, z2, ...]
     */
    getBoundingBoxOnScreen(mvp: Float32Array): Float32Array {
        if (mat4.equalsApproximately(mvp, this.lastUsedMVP)) {
            if (this.transformedCornersCache)
                return this.transformedCornersCache;
        }

        const corners = [
            this._boundingBox[0], this._boundingBox[1], this._boundingBox[2],
            this._boundingBox[3], this._boundingBox[1], this._boundingBox[2],
            this._boundingBox[0], this._boundingBox[4], this._boundingBox[2],
            this._boundingBox[3], this._boundingBox[4], this._boundingBox[2],
            this._boundingBox[0], this._boundingBox[1], this._boundingBox[5],
            this._boundingBox[3], this._boundingBox[1], this._boundingBox[5],
            this._boundingBox[0], this._boundingBox[4], this._boundingBox[5],
            this._boundingBox[3], this._boundingBox[4], this._boundingBox[5],
        ];

        const transformedCorners = new Float32Array(24);
        for (let i = 0; i < 8; i++) {
            const corner = vec4.fromValues(corners[i * 3], corners[i * 3 + 1], corners[i * 3 + 2], 1.0);
            const transformedCorner = vec4.create();
            vec4.transformMat4(corner, mvp, transformedCorner);

            const ndc = vec4.create();
            vec4.scale(transformedCorner, 1 / transformedCorner[3], ndc);

            if (ndc[3] <= 0) {
                transformedCorner[i * 3 + 0] = 0;
                transformedCorner[i * 3 + 1] = 0;
                transformedCorner[i * 3 + 2] = ndc[3];
                continue;
            }

            // Convert ndc to screen space coordinates
            const screen_x = (ndc[0] * 0.5 + 0.5) * this._screenSize[0];
            const screen_y = (ndc[1] * 0.5 + 0.5) * this._screenSize[1];

            transformedCorners[i * 3] = screen_x;
            transformedCorners[i * 3 + 1] = screen_y;
            transformedCorners[i * 3 + 2] = ndc[3];
        }

        mat4.copy(mvp, this.lastUsedMVP);
        this.transformedCornersCache = transformedCorners;
        return transformedCorners;
    }

    private NDC_BoundingBox_cached: Float32Array | null = null;

    /**
     * Gets the bounding box of the batch in NDC space. The bounding box is an array of 8 numbers: [x1, y1, z1, x2, y2, z2, ...]
     *
     * <b>NOTE:</b> Because this function gets called before {@link getBoundingBoxOnScreen}, the last used MVP matrix should not be updated here.
     *
     * @param mvp
     */
    getBoundingBoxInNDC(mvp: Float32Array): Float32Array {
        if (mat4.equalsApproximately(mvp, this.lastUsedMVP)) {
            if (this.NDC_BoundingBox_cached)
                return this.NDC_BoundingBox_cached;
        }
        const corners = [
            [this._boundingBox[0], this._boundingBox[1], this._boundingBox[2]],
            [this._boundingBox[3], this._boundingBox[1], this._boundingBox[2]],
            [this._boundingBox[0], this._boundingBox[4], this._boundingBox[2]],
            [this._boundingBox[3], this._boundingBox[4], this._boundingBox[2]],
            [this._boundingBox[0], this._boundingBox[1], this._boundingBox[5]],
            [this._boundingBox[3], this._boundingBox[1], this._boundingBox[5]],
            [this._boundingBox[0], this._boundingBox[4], this._boundingBox[5]],
            [this._boundingBox[3], this._boundingBox[4], this._boundingBox[5]],
        ];

        const transformedCorners = new Float32Array(24);
        for (let i = 0; i < 8; i++) {
            const corner = vec4.fromValues(corners[i][0], corners[i][1], corners[i][2], 1.0);
            const transformedCorner = vec4.create();
            vec4.transformMat4(corner, mvp, transformedCorner);

            const ndc = vec4.create();
            vec4.scale(transformedCorner, 1 / transformedCorner[3], ndc);

            transformedCorners[i * 3] = ndc[0];
            transformedCorners[i * 3 + 1] = ndc[1];
            transformedCorners[i * 3 + 2] = ndc[2];
        }

        // update the cached value
        // mat4.copy(transformedCorners, this.NDC_BoundingBox_cached); // Do not updated here!
        this.NDC_BoundingBox_cached = transformedCorners;
        return transformedCorners;
    }


    /**
     * Check if the batch is in the view frustum. This is checked in NDC space.
     *
     * @param mvp The model view projection matrix.
     * @returns True if the batch is on screen, false otherwise.
     */
    isInFrustum(mvp: Float32Array): boolean {
        const ndcCorners = this.getBoundingBoxInNDC(mvp);
        let ndcMin = [Infinity, Infinity, Infinity];
        let ndcMax = [-Infinity, -Infinity, -Infinity];
        let hasValidCoords = false;

        for (let i = 0; i < 8; i++) {
            const x = ndcCorners[i * 3];
            const y = ndcCorners[i * 3 + 1];
            const z = ndcCorners[i * 3 + 2];

            // Skip invalid corners (behind camera, w <= 0 → marked as -Infinity earlier)
            if (!isFinite(x) || !isFinite(y) || !isFinite(z))
                continue;

            ndcMin[0] = Math.min(ndcMin[0], x);
            ndcMin[1] = Math.min(ndcMin[1], y);
            ndcMin[2] = Math.min(ndcMin[2], z);

            ndcMax[0] = Math.max(ndcMax[0], x);
            ndcMax[1] = Math.max(ndcMax[1], y);
            ndcMax[2] = Math.max(ndcMax[2], z);

            hasValidCoords = true;
        }

        if (!hasValidCoords) return false;

        // Check intersection with the NDC cube [-1, 1] on all axes
        return ndcMin[0] <= 1 && ndcMax[0] >= -1 &&
            ndcMin[1] <= 1 && ndcMax[1] >= -1
            // && ndcMin[2] <= 1 && ndcMax[2] >= -1; // This seems to cause issues. I'll leave depth testing fully up to the GPU for now.
    }

    /**
     * Returns the number of points actually loaded in the batch.
     */
    filledSize() {
        return this._filledSize;
    }

    /**
     * Returns true if the batch is full.
     */
    isFull() {
        return this._filledSize >= this.batchSize;
    }

    /**
     * Returns true if the Host buffers are ready to be written to the GPU and not currently in use (for example by another copy operation).
     */
    canBeWrittenToGPU() {
        return this.buffersReadyToWrite && !this.buffersInFlight;
    }

    /**
     * Returns true if the batch has been uploaded to the GPU.
     */
    isWrittenToGPU() {
        return this.buffersWrittenToGPU;
    }

    /**
     * The maximum number of {@bold Points} that can be loaded into the batch.
     */
    getBatchSize() {
        return this.batchSize;
    }

    /**
     * Get the id of the batch.
     */
    getID() {
        return this._id;
    }

    /**
     * Get the accuracy level of the batch. The accuracy level is determined by the size of the bounding box on screen.
     * 0: coarse, 1: medium, 2: fine.
     * @param mVP The model view projection matrix.
     */
    getAccuracyLevel(mVP: Float32Array) {
        const cornersOnScreen = this.getBoundingBoxOnScreen(mVP);

        // default to coarse level of detail
        let accuracyLevel = 0;

        let min_x = this._screenSize[0];
        let max_x = 0;
        let min_y = this._screenSize[1];
        let max_y = 0;

        for (let i = 0; i < 8; i++) {
            const x = cornersOnScreen[i * 3];
            const y = cornersOnScreen[i * 3 + 1];

            if (x < min_x) min_x = x;
            if (x > max_x) max_x = x;
            if (y < min_y) min_y = y;
            if (y > max_y) max_y = y;
        }

        const width = max_x - min_x;
        const height = max_y - min_y;
        // If bounding box is bigger than 1/8 of the screen, use medium level of detail
        if (width > this._screenSize[0] / 8 || height > this._screenSize[1] / 8) {
            accuracyLevel = 1;
        }

        // If bounding box is bigger than 1/4 of the screen, use fine level of detail
        if (width > this._screenSize[0] / 4 || height > this._screenSize[1] / 4) {
            accuracyLevel = 2;
        }

        return accuracyLevel;
    }

    /**
     * Get the bounding box of the batch. The bounding box is an array of 6 numbers: [minX, minY, minZ, maxX, maxY, maxZ].
     */
    getBoundingBox(): number[] {
        return this._boundingBox;
    }

    create_bindGroups(): void {
        const buffers_for_depth = [
            this._uniformBuffer,
            this._depthBuffer,
            this.getCoarseGPUBuffer()
        ]
        const buffers_for_compute = [
            this._uniformBuffer,
            this._depthBuffer,
            this._frameBuffer,
            this.getColorGPUBuffer(),
            this.getCoarseGPUBuffer()
        ];

        this.bindGroups_depth = [];
        this.bindGroups_rendering = [];

        // coarse
        this.bindGroups_depth.push(Util.createBindGroup(this._device, this._compute_depth_shader_bindGroupLayouts[0], buffers_for_depth));
        this.bindGroups_depth[0].label = 'bind group depth 0';
        this.bindGroups_rendering.push(Util.createBindGroup(this._device, this._compute_shader_bindGroupLayouts[0], buffers_for_compute));
        this.bindGroups_rendering[0].label = 'bind group render 0';

        // medium
        buffers_for_compute.push(this.getMediumGPUBuffer());
        buffers_for_depth.push(this.getMediumGPUBuffer());

        this.bindGroups_depth.push(Util.createBindGroup(this._device, this._compute_depth_shader_bindGroupLayouts[1], buffers_for_depth));
        this.bindGroups_depth[1].label = 'bind group depth 1';
        this.bindGroups_rendering.push(Util.createBindGroup(this._device, this._compute_shader_bindGroupLayouts[1], buffers_for_compute));
        this.bindGroups_rendering[1].label = 'bind group render 1';

        // fine
        buffers_for_compute.push(this.getFineGPUBuffer());
        buffers_for_depth.push(this.getFineGPUBuffer());

        this.bindGroups_depth.push(Util.createBindGroup(this._device, this._compute_depth_shader_bindGroupLayouts[2], buffers_for_depth));
        this.bindGroups_depth[2].label = 'bind group depth 2';
        this.bindGroups_rendering.push(Util.createBindGroup(this._device, this._compute_shader_bindGroupLayouts[2], buffers_for_compute));
        this.bindGroups_rendering[2].label = 'bind group render 2';
    }

    get_depth_bindGroup(type: number): GPUBindGroup | null {
        if (this.bindGroups_depth)
            return this.bindGroups_depth[type];
        return null;

    }

    get_compute_bindGroup(type: number): GPUBindGroup | null {
        if (this.bindGroups_rendering)
            return this.bindGroups_rendering[type];
        return null;
    }
}