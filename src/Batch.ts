import {mat4, vec2, vec3, vec4} from "webgpu-matrix";
import {u_int32} from "./types/c_equivalents";
import assert from "node:assert";

type UniformType = {
    // origin of the bounding box, will be padded to vec4 = 16 bytes
    origin: vec3.default;
    // size of the bounding box, will be padded to vec4 = 16 bytes
    size: vec3.default;
    // 0: coarse, 1: medium, 2: fine. Won't be padded.
    renderMode: u_int32;
}

export class Batch {
    /**
     * Bounding box of the batch. The bounding box is an array of 6 numbers: [minX, minY, minZ, maxX, maxY, maxZ].
     * @private
     */
    private _boundingBox: number[];
    /**
     * Size of the batch. The size is an array of 3 numbers: [sizeX, sizeY, sizeZ].
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

    /**
     * The GPU buffer containing the vertices of the batch.
     * The course buffer contains the 10 most significant bits of x, y and z as distances from the bounding box origin.
     * @private
     */
    private gpuBuffer_coarse: GPUBuffer;
    private gpuBuffer_medium: GPUBuffer;
    private gpuBuffer_fine: GPUBuffer;
    private gpuBuffer_color: GPUBuffer;

    private hostBuffer_coarse?: Uint32Array;
    private hostBuffer_medium?: Uint32Array;
    private hostBuffer_fine?: Uint32Array;
    private hostBuffer_color?: Uint32Array;
    private buffersReadyToWrite: boolean;
    private buffersInFlight: boolean;
    private buffersWrittenToGPU: boolean;

    private _device: GPUDevice;

    constructor(
        device: GPUDevice,
        bufferSize: number,
        screenSize: vec2.default,
        id: number
    ) {
        console.log("Creating new batch with size", bufferSize);
        this._id = id;
        this._device = device;
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

        this._boundingBox = [0, 0, 0, 0, 0, 0];
        this._size = [0, 0, 0];
        this._filledSize = 0;
    }

    private makeGPUBuffer(size: number, label: string) {
        return this._device.createBuffer({
            label: label,
            size: size * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    }

    // private makeUniformGPUBuffer() {
    //     return this._device.createBuffer({
    //         size: 4 * 4 * 2 + 4,
    //         usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    //     });
    // }

    /**
     * Load points into the batch. Each point has to be processed into a fine, medium and coarse representation and then loaded into the corresponding GPU buffer.
     * The bounding box and the size of the batch are also updated.
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
        // unit32 max value
        const factor = 2 ** 32;

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
            xDist = xDist / boxSize[0];
            yDist = yDist / boxSize[1];
            zDist = zDist / boxSize[2];

            // transform to [0, 2^32]
            xDist = Math.floor(xDist * factor);
            yDist = Math.floor(yDist * factor);
            zDist = Math.floor(zDist * factor);

            // read out coarse, medium and fine
            const coarseX = (xDist >> 22) & 0x3FF;
            const coarseY = (yDist >> 22) & 0x3FF;
            const coarseZ = (zDist >> 22) & 0x3FF;
            // coarse[i] = (coarseX << 20) | (coarseY << 10) | coarseZ;
            courseView.setUint32(i * 4, (coarseX << 20) | (coarseY << 10) | coarseZ, true);

            const mediumX = (xDist >> 12) & 0x3FF;
            const mediumY = (yDist >> 12) & 0x3FF;
            const mediumZ = (zDist >> 12) & 0x3FF;
            // medium[i] = (mediumX << 20) | (mediumY << 10) | mediumZ;
            mediumView.setUint32(i * 4, (mediumX << 20) | (mediumY << 10) | mediumZ, true);

            const fineX = (xDist >> 2) & 0x3FF;
            const fineY = (yDist >> 2) & 0x3FF;
            const fineZ = (zDist >> 2) & 0x3FF;
            // fine[i] = (fineX << 20) | (fineY << 10) | fineZ;
            fineView.setUint32(i * 4, (fineX << 20) | (fineY << 10) | fineZ, true);

            // color[i] = c;
            colorView.setUint32(i * 4, c, true);
        }

        // Buffer is ready to be written to the GPU. Can be done in the render loop so only one Buffer is written per frame.
        this.buffersReadyToWrite = true;

        this._filledSize += numPointsToLoad;
        return;
    }

    async writeDataToGPUBuffer() {
        if (this.buffersReadyToWrite && !this.buffersInFlight) {
            console.log("Writing data to GPU buffer for Batch: ", this._id);
            this._device.queue.writeBuffer(this.gpuBuffer_coarse, 0, this.hostBuffer_coarse!);
            this._device.queue.writeBuffer(this.gpuBuffer_medium, 0, this.hostBuffer_medium!);
            this._device.queue.writeBuffer(this.gpuBuffer_fine, 0, this.hostBuffer_fine!);
            this._device.queue.writeBuffer(this.gpuBuffer_color, 0, this.hostBuffer_color!);
            this.buffersInFlight = true;

            /*
            await this._device.queue.onSubmittedWorkDone();
            this.buffersReadyToWrite = false;
            this.buffersWrittenToGPU = true;
            this.buffersInFlight = false;
            console.log("Finished writing data to GPU buffer for Batch: ", this._id);
            */

            // /*
                this._device.queue.onSubmittedWorkDone().then(() => {
                    // finished writing to GPU
                    this.buffersReadyToWrite = false;
                    this.buffersWrittenToGPU = true;
                    this.buffersInFlight = false;
                    console.log(`Finished writing ${this.gpuBuffer_coarse.size * 4} bytes of data to GPU buffer for Batch: `, this._id);
                }).catch((error) => {
                    console.error("Error writing data to GPU buffer for Batch: ", this._id, error);
                });
                // */
        }
    }

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

    destroyGPUBuffers() {
        this.gpuBuffer_coarse.destroy();
        this.gpuBuffer_medium.destroy();
        this.gpuBuffer_fine.destroy();
        this.gpuBuffer_color.destroy();
    }

    destroyHostBuffers() {
        delete this.hostBuffer_coarse;
        delete this.hostBuffer_medium;
        delete this.hostBuffer_fine;
        delete this.hostBuffer_color;
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

        if (this._boundingBox[0] > this._boundingBox[3] || this._boundingBox[1] > this._boundingBox[4] || this._boundingBox[2] > this._boundingBox[5]) {
            console.error("Bounding box is invalid: ", this._boundingBox);
        }

        this._size = [
            (this._boundingBox[3] - this._boundingBox[0]),
            (this._boundingBox[4] - this._boundingBox[1]),
            (this._boundingBox[5] - this._boundingBox[2])
        ];
        return;
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
    getBoundingBoxOnScreen(mvp: Float32Array) {
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
            const corner = vec4.fromValues(corners[i * 3], corners[i * 3 + 1], corners[i * 3 + 2], 1);
            const transformedCorner = vec4.create();
            vec4.transformMat4(corner, mvp, transformedCorner);

            const ndc = vec4.create();
            vec4.scale(transformedCorner, 1 / transformedCorner[3], ndc);

            // Convert ndc to screen space coordinates
            const screen_x = (ndc[0] * 0.5 + 0.5) * this._screenSize[0];
            const screen_y = (ndc[1] * 0.5 + 0.5) * this._screenSize[1];

            transformedCorners[i * 3] = screen_x;
            transformedCorners[i * 3 + 1] = screen_y;
            transformedCorners[i * 3 + 2] = ndc[3];
        }

        return transformedCorners;
    }

    /**
     * Check if the batch is on screen. The batch is on screen if at least one of the eight corners of the bounding box is on screen.
     * @param mvp The model view projection matrix.
     * @returns True if the batch is on screen, false otherwise.
     */
    isOnScreen(mvp: Float32Array): boolean {
        const corners = this.getBoundingBoxOnScreen(mvp);
        for (let i = 0; i < 8; i++) {
            if (corners[i * 3] >= 0 && corners[i * 3] <= this._screenSize[0] &&
                corners[i * 3 + 1] >= 0 && corners[i * 3 + 1] <= this._screenSize[1]) {
                return true;
            }
        }
        return false;
    }

    filledSize() {
        return this._filledSize;
    }

    isFull() {
        return this._filledSize >= this.batchSize;
    }

    canBeWrittenToGPU() {
        return this.buffersReadyToWrite && !this.buffersInFlight;
    }

    isWrittenToGPU() {
        return this.buffersWrittenToGPU;
    }

    getBatchSize() {
        return this.batchSize;
    }

    getAmountOfFilledPoints() {
        return this._filledSize;
    }

    getID() {
        return this._id;
    }
}