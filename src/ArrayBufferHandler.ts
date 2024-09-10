import {DataHandler} from "./BatchHandler";

const sizeOfPoints = 4 * Float32Array.BYTES_PER_ELEMENT;

// ArrayList like implementation for ArrayBuffer
export class ArrayBufferHandler extends DataHandler {
    private buffers: ArrayBuffer[];
    /**
     * The size of the last buffer in the buffers array. This is needed because the last buffer may not be full.
     * @private
     */
    private writtenSizeOfLastBuffer: number;
    // The size it was initialized with
    /**
     * The size of the buffers in the buffers array. All buffers are of the same size.
     * The size of the last buffer may be smaller than the initial size. It is stored in writtenSizeOfLastBuffer.
     * @private
     */
    private initialBufferSize: number;

    constructor(bufferSize: number) {
        super();
        this.buffers = [];
        this.buffers.push(new ArrayBuffer(bufferSize));
        this.writtenSizeOfLastBuffer = 0;
        this.initialBufferSize = bufferSize;
    }

    /**
     * Add data to the array of buffers. All buffers are of the same size = maxSize. The data may be split into multiple buffers if it exceeds the maxSize or a buffer is full.
     * @param data The data to be added to the buffers. Arbitrary length.
     */
    add(data: ArrayBuffer) {
        console.log("Adding", data.byteLength, "bytes to buffers; =", data.byteLength / sizeOfPoints, "points");
        const currentSize = this.writtenSizeOfLastBuffer;
        const currentBuffer = this.buffers[this.buffers.length - 1];
        const currentBufferView = new Uint8Array(currentBuffer);
        const dataView = new Uint8Array(data);

        const remainingSpace = this.initialBufferSize - currentSize;

        if (data.byteLength <= remainingSpace) {
            currentBufferView.set(dataView, currentSize);
            this.writtenSizeOfLastBuffer += data.byteLength;
            console.log("Added", data.byteLength, "bytes to current buffer");
        } else {
            // add remaining space to current buffer
            const remainingData = dataView.slice(0, remainingSpace);
            currentBufferView.set(remainingData, currentSize);
            console.log("Added", remainingData.byteLength, "bytes to current buffer");

            // add new buffer
            this.writtenSizeOfLastBuffer = 0;
            try {
                this.buffers.push(new ArrayBuffer(this.initialBufferSize));
            } catch (e) {
                console.log("Error adding new buffer", e);
                return;
            }
            // recursively add the rest of the data
            this.add(data.slice(remainingSpace));
        }
    }

    async addWithLoop(data: ArrayBuffer) {
        console.log("Adding", data.byteLength, "bytes to buffers; =", data.byteLength / sizeOfPoints, "points");
        let moreData = true
        let startingIndex = 0;
        const dataView = new Uint8Array(data);


        while (startingIndex < data.byteLength) {
            if (this.writtenSizeOfLastBuffer == this.initialBufferSize) {
                this.buffers.push(new ArrayBuffer(this.initialBufferSize));
                this.writtenSizeOfLastBuffer = 0;
            }

            const currentBuffer = this.buffers[this.buffers.length - 1];
            const currentBufferView = new Uint8Array(currentBuffer);
            const remainingSpace = this.initialBufferSize - this.writtenSizeOfLastBuffer;
            const remainingData = dataView.slice(startingIndex, startingIndex + remainingSpace);

            currentBufferView.set(remainingData, this.writtenSizeOfLastBuffer);
            this.writtenSizeOfLastBuffer += remainingData.byteLength;
            startingIndex += remainingData.byteLength;
            console.log("Added", remainingData.byteLength, "bytes to current buffer. Starting index is now", startingIndex);

            // sleep for 1s for testing
            // await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    getBuffer(buffer_num: number) {
        return this.buffers[buffer_num];
    }

    getBufferLength(buffer_num: number) {
        if (buffer_num == this.buffers.length - 1) {
            return this.writtenSizeOfLastBuffer;
        }
        return this.initialBufferSize;
    }

    // The number of buffers in the handler
    numberOfBuffers(): number {
        return this.buffers.length;
    }

    // The maximum size of one buffer
    getBufferSize(): number {
        return this.initialBufferSize;
    }

    // The real used size of all buffers together
    getTotalBufferSize() {
        return (this.numberOfBuffers() * (this.buffers.length - 1)) + this.writtenSizeOfLastBuffer;
    }

    getInitialBufferSize() {
        return this.initialBufferSize;
    }
}