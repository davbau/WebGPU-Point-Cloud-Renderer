// ts: [mVP_uniformBuffer, pointsBuffer, depthBuffer]
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
@group(0) @binding(2) var<storage, read_write> depthBuffer: array<atomic<u32>>; // I cannot use f32 for atomic operations. https://www.w3.org/TR/WGSL/#atomic-builtin-functions

@compute @workgroup_size(1)
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
    @builtin(num_workgroups) num_wg: vec3<u32>
) {
    // Read the point from the input buffer
    // Apparently point is a reserved word, so I'm using dot
    let dot = inputBuffer[gid.x];

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

    // compute depth
//    let uint_depth = u32 (ndc.w * f32(0xFFFFFFFF));
//    let uint_depth = u32(ndc.z * f32(u32(0xFFFFFFFF)));
    let uint_depth = bitcast<u32>(ndc.w);
    atomicMin(&depthBuffer[index], uint_depth);
}
