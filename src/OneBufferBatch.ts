import {vec2, vec4} from "webgpu-matrix";
import {u_int32} from "./types/c_equivalents";

export class OneBufferBatch {
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
     * The GPU buffer containing the vertices and color of the batch.
     * @private
     */
    private gpuBuffer_points: GPUBuffer;

    /**
     * The epsilon value used for floating point comparisons.
     * @private
     */
    private epsilon: number = 1e-6;

    private hostBuffer_points?: Float32Array;

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
        this._screenSize = screenSize;

        this.batchSize = bufferSize / 16;

        this.gpuBuffer_points = this.makeGPUBuffer(this.batchSize, "points batch " + id);

        this.hostBuffer_points = new Float32Array(4 * this.batchSize);

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
            size: size * 4 * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Load data into the batch. The bounding box and size are also calculated.
     * @param data
     */
    async loadData(data: ArrayBuffer): Promise<void> {
        const numPoints = data.byteLength / 16;
        const numPointsToLoad = Math.min(numPoints, this.batchSize - this._filledSize);

        // find bounding box
        const boundingBoxFound = this.findBoundingBox(data, numPointsToLoad);

        this.hostBuffer_points = new Float32Array(data);

        this._filledSize += numPointsToLoad;
        this.buffersReadyToWrite = true;

        await boundingBoxFound;
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

    getPointsGpuBuffer() {
        return this.gpuBuffer_points;
    }

    destroyGPUBuffers() {
        this.gpuBuffer_points.destroy();
    }

    destroyHostBuffers() {
        delete this.hostBuffer_points;
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
            const corner = vec4.fromValues(
                corners[i * 3],
                corners[i * 3 + 1],
                corners[i * 3 + 2],
                1);
            const transformedCorner = vec4.create();
            vec4.transformMat4(corner, mvp, transformedCorner);

            // Skip points behind the camera
            if (transformedCorner[3] <= 0) {
                continue;
            }

            const ndc = vec4.create();
            // make sure not to divide by zero
            if (Math.abs(transformedCorner[3]) > this.epsilon) {
                vec4.scale(transformedCorner, 1 / transformedCorner[3], ndc);
            }

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

    /**
     * Get the number of points actually in the batch.
     */
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

    async writeDataToGPUBuffer(): Promise<void> {
        if (this.buffersReadyToWrite && !this.buffersInFlight) {
            console.log("Writing data to GPU buffer for Batch: ", this._id);
            this._device.queue.writeBuffer(this.gpuBuffer_points, 0 , this.hostBuffer_points!.buffer, 0, this.hostBuffer_points!.byteLength);
            this.buffersInFlight = true;

            // await new Promise(resolve => setTimeout(resolve, 1000)); // timeout for 1 second for testing

            this._device.queue.onSubmittedWorkDone().then(() => {
                // finished writing to GPU
                this.buffersReadyToWrite = false;
                this.buffersWrittenToGPU = true;
                this.buffersInFlight = false;
                console.log(`Finished writing ${this.gpuBuffer_points.size} bytes of data to GPU buffer for Batch: `, this._id);
            }).catch((error) => {
                console.error("Error writing data to GPU buffer for Batch: ", this._id, error);
            });
        }
        return;
    }

    getID() {
        return this._id;
    }
}