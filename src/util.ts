export class Util {
    static createPipelineDescriptor_pos4_uv2(device: GPUDevice, shader_module: GPUShaderModule, vs_entry_point: string, fs_entry_point: string, format: GPUTextureFormat): GPURenderPipelineDescriptor {
        return {
            layout: 'auto',
            vertex: {
                module: shader_module,
                entryPoint: vs_entry_point,
                buffers: [
                    {
                        arrayStride: 6 * 4,
                        attributes: [
                            { // position
                                format: 'float32x4',
                                offset: 0,
                                shaderLocation: 0
                            },
                            { // uv
                                format: 'float32x2',
                                shaderLocation: 1,
                                offset: 4 * 4
                            }
                        ]
                    }
                ]
            },
            fragment: {
                module: shader_module,
                entryPoint: fs_entry_point,
                targets: [{format: format}],
            },
        } as GPURenderPipelineDescriptor;
    };

    static createBindGroup(device: GPUDevice, layout: GPUBindGroupLayout, buffers: GPUBuffer[]): GPUBindGroup {
        const entries = buffers.map((buffer, i) => {
            return {
                binding: i,
                resource: {
                    buffer: buffer
                }
            };
        });

        return device.createBindGroup({
            layout: layout,
            entries: entries
        });
    };

    static create_display_RenderPassDescriptor(context: GPUCanvasContext, clearValue: GPUColor): GPURenderPassDescriptor {
        return {
            label: "display render pass",
            colorAttachments: [
                {
                    storeOp: 'store',
                    loadOp: 'clear',
                    view: context.getCurrentTexture().createView(),
                    clearValue: clearValue,
                }
            ]
        } as GPURenderPassDescriptor;
    };
}