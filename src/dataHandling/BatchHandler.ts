import {vec2} from "webgpu-matrix";
import {Batch} from "./Batch";
import {SIZE_OF_POINT} from "../types/c_equivalents";
import {LASHeader_small} from "./SmallLASLoader";

export class BatchHandler {
    private counter: number = 0;
    private _device: GPUDevice;
    private _compute_depth_shader_bindGroupLayouts: GPUBindGroupLayout[];
    private _compute_shader_bindGroupLayouts: GPUBindGroupLayout[];

    private _uniformBuffer: GPUBuffer;
    private _depthBuffer: GPUBuffer;
    private _frameBuffer: GPUBuffer;
    /**
     * The maximum number of points in each batch.
     * @private
     */
    private _batchSize: number;
    private _batches: Batch[];
    private _screenSize: vec2.default;

    constructor(
        device: GPUDevice,
        uniformBuffer: GPUBuffer,
        depthBuffer: GPUBuffer,
        frameBuffer: GPUBuffer,
        compute_depth_shader_bindGroupLayouts: GPUBindGroupLayout[],
        compute_shader_bindGroupLayouts: GPUBindGroupLayout[],
        batchSize: number,
        screenSize: vec2.default
    ) {
        this._device = device;
        this._uniformBuffer = uniformBuffer;
        this._depthBuffer = depthBuffer;
        this._frameBuffer = frameBuffer;
        this._compute_depth_shader_bindGroupLayouts = compute_depth_shader_bindGroupLayouts;
        this._compute_shader_bindGroupLayouts = compute_shader_bindGroupLayouts;
        this._batchSize = batchSize;
        this._screenSize = screenSize

        this._batches = [];
        this.addBatch();
    }

    /**
     * Add a new empty {@link Batch} to the batch handler and returns the newly created {@link Batch} instance.
     */
    addBatch(): Batch {
        this._batches.push(new Batch(
            this._device,
            this._uniformBuffer,
            this._depthBuffer,
            this._frameBuffer,
            this._compute_depth_shader_bindGroupLayouts,
            this._compute_shader_bindGroupLayouts,
            this._batchSize,
            this._screenSize,
            this.counter++
        ));
        return this._batches[this._batches.length - 1];
    }

    /**
     * For each batch in the batch handler, call the callback function with the batch as the argument.
     * @param callback
     */
    forEachBatch(callback: (batch: Batch) => void) {
        this._batches.forEach(callback);
    }

    /**
     * For each batch in the batch handler that is on screen, call the callback function with the batch as the argument.
     * If the batch is on screen is determined by calling the {@link Batch.isInFrustum} method.
     * @param mvp
     * @param callback
     */
    forEachBatchOnScreen(mvp: Float32Array, callback: (batch: Batch) => void) {
        this._batches.forEach(batch => {
            if (batch.isInFrustum(mvp)) {
                callback(batch);
            }
        });
    }

    /**
     * Get the batch at the given index.
     * @param index
     */
    getBatch(index: number) {
        return this._batches[index];
    }

    /**
     * Get all the batches in the batch handler.
     */
    getBatches() {
        return this._batches;
    }

    /**
     * Add an arbitrary amount of data to the batch handler. The data is split into batches of size batchSize.
     * @param data The {@link ArrayBuffer} of data to be added to the batch handler. Arbitrary length.
     * @param header
     * @returns {Promise<void>} A promise that resolves when the data has been added to the batch handler.
     */
    add(data: ArrayBuffer, header: LASHeader_small | null = null) {
        let remainingData = data;
        let currentBatch = this._batches[this._batches.length - 1];

        while (remainingData.byteLength > 0) {
            // Find out how many points can fit into the current batch.
            const currentBatchFilledSize = currentBatch.filledSize();
            const remainingSpace = this._batchSize - currentBatchFilledSize * 16;

            // If the current batch is full, create a new batch.
            if (remainingSpace <= 0) {
                // currentBatch.writeDataToGPUBuffer(true);
                currentBatch = this.addBatch();
            } else {
                // Calculate how much data we can write to the current batch.
                // const maxDataToWrite = remainingSpace * SIZE_OF_POINT;
                const dataToWrite = remainingData.slice(0, remainingSpace);

                // New method
                // Load the data into the current batch.
                currentBatch.loadData(dataToWrite, header);
                // currentBatch.writeDataToGPUBuffer(true);
                currentBatch.writeNewDataToGPUBuffer(currentBatchFilledSize * 4, dataToWrite.byteLength / 4, true);

                // Old method
                // currentBatch.addNewData(dataToWrite);

                // Update the remaining data.
                remainingData = remainingData.slice(remainingSpace);
            }
        }
    }

    /**
     * Write the data of the first batch that can be written to the GPU to the GPU.
     *
     * This method is called once per frame to decrease initial loading time.
     */
    writeOneBufferToGPU() {
        for (let b of this._batches) {
            if (b.canBeWrittenToGPU()) {
                b.writeDataToGPUBuffer(true);
            }
        }
    }

    /**
     * Get the number of batches in the batch handler.
     */
    numberOfBuffers(): number {
        return this._batches.length;
    }

    /**
     * Get the total model extent of all the batches. Has the form [minX, minY, minZ, maxX, maxY, maxZ].
     * @returns {number[6]} The total model extent of all the batches.
     */
    getTotalModelExtent() {
        let min = [Infinity, Infinity, Infinity];
        let max = [-Infinity, -Infinity, -Infinity];

        this._batches.forEach(batch => {
            const modelExtent = batch.getBoundingBox();
            if (modelExtent[0] < min[0]) min[0] = modelExtent[0];
            if (modelExtent[1] < min[1]) min[1] = modelExtent[1];
            if (modelExtent[2] < min[2]) min[2] = modelExtent[2];

            if (modelExtent[3] > max[0]) max[0] = modelExtent[3];
            if (modelExtent[4] > max[1]) max[1] = modelExtent[4];
            if (modelExtent[5] > max[2]) max[2] = modelExtent[5];
        });

        return [min[0], min[1], min[2], max[0], max[1], max[2]];
    }
}