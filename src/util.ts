import {Point, u_int32} from "./types/c_equivalents";

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

    static randomOneOfTwoNumbers(a: number, b: number): number {
        return Math.random() > 0.5 ? a : b;
    }

    static randomNumberBetween(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

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