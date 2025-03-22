export class ShaderHelper {
    static gpuPipelineLayoutEntry_uniform: GPUBindGroupLayoutEntry = {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: 'uniform',
            hasDynamicOffset: true, // Enable dynamic offsets
        },
    };

    static gpuPipelineLayoutEntry_depth: GPUBindGroupLayoutEntry = {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: 'storage',
        }
    }

    static gpuPipelineLayoutEntry_frame: GPUBindGroupLayoutEntry = {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: 'storage',
        }
    }

    static gpuPipelineLayoutEntry_color: GPUBindGroupLayoutEntry = {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: 'read-only-storage',
        },
    }

    static gpuPipelineLayoutEntry_coarse: GPUBindGroupLayoutEntry = {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: 'read-only-storage',
        },
    }

    static gpuPipelineLayoutEntry_medium: GPUBindGroupLayoutEntry = {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: 'read-only-storage',
        },
    }

    static gpuPipelineLayoutEntry_fine: GPUBindGroupLayoutEntry = {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: 'read-only-storage',
        },
    };
}