struct VertexIn {
    @location(0) position: vec4<f32>,
    @location(1) uv: vec2<f32>,
}

struct Fragment {
    @builtin(position) Position: vec4<f32>,
    @location(0) fragUV : vec2f,
};

struct Uniforms {
    canvas_size: vec2<f32>,
    mvp: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> inputBuffer: array<atomic<u32>>;

@vertex
fn vs_main(v: VertexIn) -> Fragment {
    var output = Fragment();
    output.Position = v.position;
    output.fragUV = v.uv;
    return output;
}

@fragment
fn fs_main(f: Fragment) -> @location(0) vec4<f32> {
    let width = uniforms.canvas_size.x;
    let height = uniforms.canvas_size.y;

    let screen_x = u32(f.fragUV.x * width);
    let screen_y = u32(f.fragUV.y * height);

    let index = screen_y * u32(width) + screen_x;

    // load the aggregate color values.
    let r = atomicLoad(&inputBuffer[index * 4 + 0]);
    let g = atomicLoad(&inputBuffer[index * 4 + 1]);
    let b = atomicLoad(&inputBuffer[index * 4 + 2]);
    // The alpha channel holds the number of points that contributed to the pixel.
    let a = atomicLoad(&inputBuffer[index * 4 + 3]);

    // Compute average color using the accumulated values and the number of points.
    let divider = f32(a) * 255.0;
    let color = vec4<f32>(
        f32(r) / divider,
        f32(g) / divider,
        f32(b) / divider,
        1.0
    );

    return color;
}