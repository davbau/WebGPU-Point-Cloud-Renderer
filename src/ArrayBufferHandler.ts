const sizeOfPoints = 4 * Float32Array.BYTES_PER_ELEMENT;

// ArrayList like implementation for ArrayBuffer
export class ArrayBufferHandler {
    private buffer: ArrayBuffer;
    private size: number;
    private previousSize: number;
    // The size it was initialized with
    private maxSize: number;
    bufferShouldBeRead: boolean;

    constructor(maxSize: number) {
        this.buffer = new ArrayBuffer(maxSize);
        this.size = 0;
        this.previousSize = 0;
        this.maxSize = maxSize;
        this.bufferShouldBeRead = false;
    }

    add(data: ArrayBuffer) {
        if (this.size + data.byteLength > this.maxSize) {
            throw new Error("Buffer overflow");
        }

        const view = new Uint8Array(this.buffer);
        view.set(new Uint8Array(data), this.size);
        this.size += data.byteLength;

        console.log("Added", data.byteLength, "bytes to buffer");
        this.bufferShouldBeRead = true;
    }

    getBuffer(skipNPoints: number = 0) {
        this.bufferShouldBeRead = false;
        return this.buffer.slice(skipNPoints * sizeOfPoints, this.size);
    }

    getOnlyNewData() {
        const newBytes = this.size - this.previousSize;
        const data = this.buffer.slice(this.previousSize, this.size);
        this.previousSize = this.size;
        return {data, newBytes};
    }

    popN_Bytes(numberOfBytes: number) {
        if (this.size == 0) {
            this.bufferShouldBeRead = false;
        }
        if (numberOfBytes > this.size) {
            numberOfBytes = this.size;
        }
        const data = this.buffer.slice(this.size - numberOfBytes, this.size);
        this.size -= data.byteLength;
        console.log("Popped", data.byteLength, "bytes from buffer", this.size, "bytes left");
        return data;
    }
}