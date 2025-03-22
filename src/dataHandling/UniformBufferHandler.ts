import {Batch} from "./Batch";
import {vec2} from "webgpu-matrix";
import {isNumberObject} from "node:util/types";
import {BatchInfo} from "../main";

export class UniformBufferHandler {
    private dynamicUniformBuffer!: Float32Array;
    private dynamic_GpuBuffer!: GPUBuffer;
    private uniformBuffer_size = 4 * Float32Array.BYTES_PER_ELEMENT    // canvas width, height, 2x padding
        + 16 * Float32Array.BYTES_PER_ELEMENT    // mVP
        + 4 * Float32Array.BYTES_PER_ELEMENT     // Batch origin
        + 4 * Float32Array.BYTES_PER_ELEMENT     // Batch size
        + 4 * Float32Array.BYTES_PER_ELEMENT;    // render type

    private minUniformBuffer_alignment: number;
    private actual_uniformBufferSize_with_alignment: number;

    private number_of_Batches: number = 0;

    private _device: GPUDevice;
    private _batches: Batch[];
    private _screen_size: vec2.default;
    private _mvP: Float32Array;


    public constructor(device: GPUDevice, batches: Batch[], screen_size: vec2.default, mvP: Float32Array) {
        this._device = device;
        this._batches = batches;
        this._screen_size = screen_size;
        this._mvP = mvP;

        this.minUniformBuffer_alignment = this._device.limits.minUniformBufferOffsetAlignment;
        this.actual_uniformBufferSize_with_alignment = Math.ceil(this.uniformBuffer_size / this.minUniformBuffer_alignment) * this.minUniformBuffer_alignment;

        this.create_uniformBuffer();
        this.create_gpuBuffer();
    }

    /**
     * Updates the uniform buffers on host and on device if the batches changed. If the batches array is the same as the one already present, this method does nothing.
     * @param batches
     * @param renderTypes array of numbers holding the render types for the batches.
     */
    public update_uniforms(batches: Batch[], renderTypes: number[]) {
        if (batches.length == 0) return;
        if (batches.length == this._batches.length) return;

        this._batches = batches;
        this.create_uniformBuffer()
        this.update_uniformBuffer(renderTypes);
    }

    public create_uniformBuffer() {
        this.dynamicUniformBuffer = new Float32Array(this.actual_uniformBufferSize_with_alignment * this._batches.length);
    }

    public create_gpuBuffer() {
        this.dynamic_GpuBuffer = this._device.createBuffer({
            size: this.dynamicUniformBuffer.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        });
    }

    public update_uniformBuffer(render_types: number[]) {
        this._batches.forEach((batch, i) => {
            this.dynamicUniformBuffer.set(
                batch.get_dynamicUniform_Data(
                    this._screen_size,
                    this._mvP,
                    render_types[i]
                ),
                i * this.uniformBuffer_size)
        });
    }

    public update_gpuBuffer() {
        this._device.queue.writeBuffer(
            this.dynamic_GpuBuffer,
            0,
            this.dynamicUniformBuffer.buffer,
            this.dynamicUniformBuffer.byteOffset,
            this.dynamicUniformBuffer.byteLength
        );
    }
}