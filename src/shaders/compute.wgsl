// ts: [mVP_uniformBuffer, pointsBuffer, framebuffer, depthBuffer]
struct Uniforms {
    canvas_size: vec2<f32>,
    mvp: mat4x4<f32>,
};

struct Point {
    x: f32,
    y: f32,
    z: f32,
//    color: uint32_t,
    color: u32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> inputBuffer: array<Point>;
//@group(0) @binding(1) var<uniform> inputBuffer: array<Point, 4096>;
//@group(0) @binding(2) var<storage, read_write> outputBuffer: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> outputBuffer: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> depthBuffer: array<atomic<u32>>; // I cannt use f32 for atomic operations. https://www.w3.org/TR/WGSL/#atomic-builtin-functions

//@compute @workgroup_size(32, 1, 1)
@compute @workgroup_size(64, 1, 1)
//@compute @workgroup_size(128, 1, 1)
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
    @builtin(num_workgroups) num_wg: vec3<u32>
) {
    // Read the point from the input buffer
    // Apparently point is a reserved word, so I'm using dot
    let dot = inputBuffer[gid.x + gid.y * 65535];

    // Project the point using the MVP matrix
    let pos = uniforms.mvp * vec4<f32>(dot.x, dot.y, dot.z, 1.0);

    // convert pos to ndc
    let ndc = pos / pos.w;

    // Discard
    if (ndc.w < 0.0) {
        return;
    }

    // Convert ndc to screen space coordinates
    let screen_x = (ndc.x * 0.5 + 0.5) * uniforms.canvas_size.x;
    let screen_y = (ndc.y * 0.5 + 0.5) * uniforms.canvas_size.y;

    // Discard
    if (screen_x < 0.0 || screen_x >= uniforms.canvas_size.x) {
        return;
    }
    if (screen_y < 0.0 || screen_y >= uniforms.canvas_size.y) {
        return;
    }

    // Calculate the index into the output buffer using the canvas size
    let index = u32(screen_y) * u32(uniforms.canvas_size.x) + u32(screen_x);

    // Depth with bitcast
    let minDepth_u32 = atomicLoad(&depthBuffer[index]);
    let minDepth = bitcast<f32>(minDepth_u32);

    // Compute threshold
    let depthThreshold = minDepth * 1.00;
//    let depthThreshold = 0.5;

    // Discard
    if (ndc.w > depthThreshold) {
//        atomicAdd(&outputBuffer[index * 4 + 0], 0xff);
//        atomicAdd(&outputBuffer[index * 4 + 1], 0);
//        atomicAdd(&outputBuffer[index * 4 + 2], 0);
//        atomicAdd(&outputBuffer[index * 4 + 3], 1);
        return;
    }

    // uint32_t
    atomicAdd(&outputBuffer[index * 4 + 0], (dot.color >> 16) & 0xFF); // r
    atomicAdd(&outputBuffer[index * 4 + 1], (dot.color >> 8) & 0xFF); // g
    atomicAdd(&outputBuffer[index * 4 + 2], (dot.color >> 0) & 0xFF); // b
    atomicAdd(&outputBuffer[index * 4 + 3], 1); // a
}

// Convert a uint32_t color to a vec4<f32> color for use in the fragment shader.
fn uint32_t_to_vec4f32(color: u32) -> vec4<f32> {
    return vec4<f32>(
        f32((color >> 16) & 0xFF) / 255.0,
        f32((color >> 8) & 0xFF) / 255.0,
        f32((color >> 0) & 0xFF) / 255.0,
        1.0
    );
}