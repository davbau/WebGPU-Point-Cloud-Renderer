import {vec2} from "webgpu-matrix";
import {ArrayBufferHandler} from "./ArrayBufferHandler";
import {Batch} from "./Batch";

export abstract class DataHandler {
    abstract add(data: ArrayBuffer): void;

    abstract addWithLoop(data: ArrayBuffer): Promise<void>;

    abstract getBufferLength(buffer_num: number): number;

    abstract numberOfBuffers(): number;

    abstract getBufferSize(): number;

}

export class BatchHandler extends DataHandler {
    private counter: number = 0;
    private _device: GPUDevice;
    /**
     * The maximum number of points in each batch.
     * @private
     */
    private _batchSize: number;
    private _batches: Batch[];
    private _screenSize: vec2.default;

    constructor(
        device: GPUDevice,
        batchSize: number,
        screenSize: vec2.default
    ) {
        super();
        this._device = device;
        this._batchSize = batchSize;
        this._screenSize = screenSize

        this._batches = [];
        this.addBatch();
    }

    addBatch(): Batch {
        this._batches.push(new Batch(
            this._device,
            this._batchSize,
            this._screenSize,
            this.counter++
        ));
        return this._batches[this._batches.length - 1];
    }

    forEachBatch(callback: (batch: Batch) => void) {
        this._batches.forEach(callback);
    }

    forEachBatchWithIndex(callback: (batch: Batch, index: number) => void) {
        this._batches.forEach(callback);
    }

    forEachBatchOnScreen(mvp: Float32Array, callback: (batch: Batch) => void) {
        this._batches.forEach(batch => {
            if (batch.isOnScreen(mvp)) {
                callback(batch);
            }
        });
    }

    getBatch(index: number) {
        return this._batches[index];
    }

    getBatches() {
        return this._batches;
    }

    /**
     * Add an arbitrary amount of data to the batch handler. The data is split into batches of size batchSize.
     * @param data The data to be added to the batch handler. Arbitrary length.
     */
    async add(data: ArrayBuffer): Promise<void> {
        let remainingData = data;

        while (remainingData.byteLength > 0) {
            const currentBatch = this._batches[this._batches.length - 1];
            const currentBatchFilledSize = currentBatch.filledSize();
            const remainingSpace = this._batchSize - currentBatchFilledSize;

            const dataToWrite = remainingData.slice(0, remainingSpace);
            const wait = currentBatch.loadData(dataToWrite);

            remainingData = remainingData.slice(remainingSpace);

            if (remainingData.byteLength > 0) {
                this.addBatch();
            }
            await wait;
        }
    }

    async writeOneBufferToGPU(): Promise<void> {
        for (let b of this._batches) {
            if (b.canBeWrittenToGPU()) {
                await b.writeDataToGPUBuffer();
                return;
            }
        }
    }

    async addWithLoop(data: ArrayBuffer): Promise<void> {
        await this.add(data);
    }

    getBufferLength(buffer_num: number): number {
        return 0;
    }

    getBufferSize(): number {
        return 0;
    }

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