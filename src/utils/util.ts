import {Point, u_int32} from "../types/c_equivalents";

export class Util {
    /**
     * Create a {@link GPURenderPipelineDescriptor} for a pipeline.
     *
     * The vertex shader must have a position attribute and an uv attribute.
     *
     * The fragment shader must have a single output target.
     *
     *
     * @param device The GPU device.
     * @param shader_module The shader module for the vertex and fragment shader.
     * @param vs_entry_point The entry point for the vertex shader.
     * @param fs_entry_point The entry point for the fragment shader.
     * @param format The format of the output target.
     */
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

    /**
     * Create a {@link GPUBindGroupLayout} for a bind group using an array of {@link GPUBuffer}s.
     * @param device The GPU device.
     * @param layout The layout of the bind group.
     * @param buffers The buffers to bind.
     * @returns {GPUBindGroupLayout} The bind group layout.
     */
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

    /**
     * Creates a {@link GPURenderPassDescriptor} for the render pass that clears the color attachment.
     * @param context The canvas context.
     * @param clearValue The clear value for the color attachment.
     */
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

    /**
     * Add a number separator every 3 digits.
     * @param n The number to add separators to.
     * @returns {string} The number with separators.
     */
    static segmentNumber(n: number): string {
        const s = n.toString();
        let result = "";
        let count = 1;

        for (let i = s.length; i > 0; i--) {
            result = s.at(i - 1) + result;
            if (count === 3) {
                result = " " + result;
                count = 0;
            }
            count++;
        }

        return result;
    }

    static createRandomPoints(n: number): Point[] {
        const points: Point[] = [];
        const white: u_int32 = 0xffffff;
        // (255, 255, 255) = white
        console.log('white: ', white);
        for (let i = 0; i < n; i++) {
            points.push({
                x: Util.randomNumberBetween(0, 1),
                y: Util.randomNumberBetween(0, 1),
                z: Util.randomNumberBetween(0, 1),
                color: ((Math.random() * 0xff) << 16)
                    + ((Math.random() * 0xff) << 8)
                    + (Math.random() * 0xff << 0),
                // color: 0x0f0f0f,
            });
        }
        return points;
    }

    // Create points in a line (x-axis)
    static createDepthBufferTest(n: number): Point[] {
        const points: Point[] = [];
        for (let i = 0; i < n; i++) {
            points.push({
                x: 0,
                y: i / n * 100,
                z: 0,
                color: 0x0f0f0f,
            });
        }
        return points;
    }

    /**
     * Generate a random number between min and max.
     * @param min The minimum value.
     * @param max The maximum value.
     */
    static randomNumberBetween(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    /**
     * Convert an array of {@link Point}s to an ArrayBuffer.
     * @param points the array of {@link Point}s to convert.
     */
    static convertPointsToArrayBuffer(points: Point[]): ArrayBuffer {
        const arr = new ArrayBuffer(points.length * 16);
        const view = new DataView(arr);
        for (let i = 0; i < points.length; i++) {
            const offset = i * 16;
            view.setFloat32(offset + 0, points[i].x, true);
            view.setFloat32(offset + 4, points[i].y, true);
            view.setFloat32(offset + 8, points[i].z, true);
            view.setUint32(offset + 12, points[i].color, true);
        }
        return arr;
    }
}