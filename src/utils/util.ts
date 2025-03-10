import {char, Point, u_int32} from "../types/c_equivalents";

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
     * Create three gpu compute pipelines for the coarse, medium and fine buffers.
     * @param device The GPU device to create the pipelines on.
     * @param code The code of the shader as a string.
     * @param workgroup_size The workgroup size for the shader.
     * @param label The label for the pipelines. This will be appended to and used to label the shader modules as well. Name this only something like "compute" without appending "pipeline" or "shader module" yourself.
     */
    static create_compute_Pipelines_with_settings(device: GPUDevice, code: string, workgroup_size: number, label: string): GPUComputePipeline[] {
        const shader_modules = [
            Util.create_shaderModule_with_settings(device, code, "C", workgroup_size, label + " shader module coarse"),
            Util.create_shaderModule_with_settings(device, code, "M", workgroup_size, label + " shader module medium"),
            Util.create_shaderModule_with_settings(device, code, "F", workgroup_size, label + " shader module fine")
        ]

        const descriptor: GPUComputePipelineDescriptor = {
            layout: "auto",
            compute: {
                module: null as any as GPUShaderModule,
                entryPoint: "main"
            }
        }
        return shader_modules.map((module, index) => {
            descriptor.compute.module = module;
            descriptor.label = label + " pipeline " + (index === 0 ? "coarse" : index === 1 ? "medium" : "fine");
            return device.createComputePipeline(descriptor);
        });
    }

    /**
     * Create a shader module from the shader code but only keep the buffers and functions for the coarse pass.
     * @param device The GPU device to create the shader module on.
     * @param code The code of the shader as a string.
     * @param type The type of the shader (e.g. "C" for coarse, "M" for medium, "F" for fine).
     * @param workgroup_size The workgroup size for the shader.
     * @param label The optional label for the shader module.
     */
    static create_shaderModule_with_settings(device: GPUDevice, code: string, type: string, workgroup_size: number, label: string | null): GPUShaderModule {
        const stripped_code = Util.strip_shaderCode(code, type);
        const final_code = Util.change_shader_workgroup_size(stripped_code, workgroup_size);

        const shader_module_descriptor: GPUShaderModuleDescriptor = {
            code: final_code
        };
        if (label)
            shader_module_descriptor.label = label;

        return device.createShaderModule(shader_module_descriptor);
    }

    static change_shader_workgroup_size(code: string, workgroup_size: number): string {
        const lines = code.split('\n');

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("@compute")) {
                // match a number and replace it with the workgroup size
                lines[i] = lines[i].replace(/\d+/, workgroup_size.toString());
            }
        }

        return lines.join('\n');
    }

    /**
     * Removes the unnecessary buffers and functions from the shader code based on the type.
     * @param code the shader code to strip down.
     * @param type the type of shader to keep. The others will be removed.
     */
    static strip_shaderCode(code: string, type: string): string {
        const lines = code.split('\n');
        let result = "";
        let keep = false;
        const all_types = ["C", "M", "F"];
        const include_lowers = all_types.slice(0, all_types.indexOf(type) + 1);

        // Stripping single lines
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith("/*fn_") && !trimmed.startsWith("/*fn_" + type)) {
                while (!lines[i].startsWith("/*fn_end*/")) {
                    i++;
                }
                i++;
            } else if (trimmed.startsWith("/*")) {
                // keep = trimmed.startsWith("/*" + type);
                const c = trimmed.charAt(2);
                if(include_lowers.includes(c)) result += lines[i] + "\n";
            } else if (i < lines.length) result += lines[i] + "\n";
            // keep = true;

            // if (keep && i < lines.length) {
            //     result += lines[i] + '\n';
            // }
        }

        return result;
    }

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