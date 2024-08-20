const sizeOfPoints = 4 * Float32Array.BYTES_PER_ELEMENT;

// ArrayList like implementation for ArrayBuffer
export class ArrayBufferHandler {
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

    getBuffer(buffer_num: number) {
        return this.buffers[buffer_num];
    }

    getBufferLength(buffer_num: number) {
        if (buffer_num == this.buffers.length - 1) {
            return this.writtenSizeOfLastBuffer;
        }
        return this.initialBufferSize;
    }

    numberOfBuffers(): number {
        return this.buffers.length;
    }

    getBufferSize(): number {
        return this.initialBufferSize;
    }
}