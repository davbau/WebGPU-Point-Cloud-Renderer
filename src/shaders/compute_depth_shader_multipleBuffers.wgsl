struct Uniforms {
    canvas_size: vec4<f32>,
    mvp: mat4x4<f32>,
    origin: vec4<f32>,
    size: vec4<f32>,
    renderMode: u32,
};


/*
struct Points {
    coarse: array<u32>, // each u32 element has the 3x10 coarse bit coordinates of one single point.
    medium: array<u32>, // each u32 element has the 3x10 medium bit coordinates of one single point
    high: array<u32>,   // each u32 element has the 3x10 medium bit coordinates of one single point
    color: array<u32>,  // each u32 element has the color of one single point
}
*/

// The factor is used to convert the 30 bit integer coordinates to float coordinates using the batch origin and size.
const factor = 1073741823.0; // 0b0011_1111_1111_1111_1111_1111_1111_1111

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> depthBuffer: array<atomic<u32>>;

@group(0) @binding(2) var<storage, read> courseBuffer: array<u32>;
@group(0) @binding(3) var<storage, read> mediumBuffer: array<u32>;
@group(0) @binding(4) var<storage, read> fineBuffer: array<u32>;
// We don't need the color buffer for depth computation.

@compute @workgroup_size(64, 1, 1)
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
    @builtin(num_workgroups) num_wg: vec3<u32>
) {
    let pointIndex = gid.x;
    var p = vec3<u32>(0, 0, 0);
    if (uniforms.renderMode == 0u) {
        p = coarse(pointIndex);
    } else if (uniforms.renderMode == 1u) {
        p = medium(pointIndex);
    } else {
        p = fine(pointIndex);
    }

    let X = f32(p.x) * f32(uniforms.size.x / factor) + uniforms.origin.x;
    let Y = f32(p.y) * f32(uniforms.size.y / factor) + uniforms.origin.y;
    let Z = f32(p.z) * f32(uniforms.size.z / factor) + uniforms.origin.z;

    let pos = uniforms.mvp * vec4<f32>(X, Y, Z, 1.0);
    let ndc = pos / pos.w;

    // Discard points behind the camera.
    if (ndc.w < 0.0) {
        return;
    }

    // Convert ndc to screen space coordinates.
    let screen_x = (ndc.x * 0.5 + 0.5) * uniforms.canvas_size.x;
    let screen_y = (ndc.y * 0.5 + 0.5) * uniforms.canvas_size.y;

    // Discard points outside the screen.
    if (screen_x < 0.0 || screen_x >= uniforms.canvas_size.x) {
        return;
    }
    if (screen_y < 0.0 || screen_y >= uniforms.canvas_size.y) {
        return;
    }

    // Calculate the index into the output buffer using the canvas size
    let index = u32(screen_y) * u32(uniforms.canvas_size.x) + u32(screen_x);

    // compute depth
    let uint_depth = bitcast<u32>(ndc.w);
    atomicMin(&depthBuffer[index], uint_depth); // atomic min will do the calculation and store the result in depthBuffer[index].
}

// Unraveling the bit packed coordinates.
fn coarse(pointIndex: u32) -> vec3<u32> {
    let coarsebits = courseBuffer[pointIndex];

    // X, Y and Z are 10 bit integer coordinates, each with 1024 possible values
    let x_coarse = u32((coarsebits >> 20) & 0x3FF);
    let y_coarse = u32((coarsebits >> 10) & 0x3FF);
    let z_coarse = u32((coarsebits >> 0) & 0x3FF);

    let x = u32(x_coarse << 20);
    let y = u32(y_coarse << 20);
    let z = u32(z_coarse << 20);

    return vec3<u32>(x, y, z);
}

fn medium(pointIndex: u32) -> vec3<u32> {
    let coarsebits = courseBuffer[pointIndex];
    let mediumbits = mediumBuffer[pointIndex];

    // X, Y and Z are 10 bit integer coordinates, each with 1024 possible values
    let x_coarse = u32((coarsebits >> 20) & 0x3FF);
    let y_coarse = u32((coarsebits >> 10) & 0x3FF);
    let z_coarse = u32((coarsebits >> 0) & 0x3FF);

    let x_medium = u32((mediumbits >> 20) & 0x3FF);
    let y_medium = u32((mediumbits >> 10) & 0x3FF);
    let z_medium = u32((mediumbits >> 0) & 0x3FF);

    let x = (x_coarse << 20) | (x_medium << 10);
    let y = (y_coarse << 20) | (y_medium << 10);
    let z = (z_coarse << 20) | (z_medium << 10);

    return vec3<u32>(x, y, z);
}

fn fine(pointIndex: u32) -> vec3<u32> {
    let coarsebits = courseBuffer[pointIndex];
    let mediumbits = mediumBuffer[pointIndex];
    let finebits = fineBuffer[pointIndex];

    // X, Y and Z are 10 bit integer coordinates, each with 1024 possible values
    let x_coarse = u32((coarsebits >> 20) & 0x3FF);
    let y_coarse = u32((coarsebits >> 10) & 0x3FF);
    let z_coarse = u32((coarsebits >> 0) & 0x3FF);

    let x_medium = u32((mediumbits >> 20) & 0x3FF);
    let y_medium = u32((mediumbits >> 10) & 0x3FF);
    let z_medium = u32((mediumbits >> 0) & 0x3FF);

    let x_fine = u32((finebits >> 20) & 0x3FF);
    let y_fine = u32((finebits >> 10) & 0x3FF);
    let z_fine = u32((finebits >> 0) & 0x3FF);

    let x = (x_coarse << 20) | (x_medium << 10) | x_fine;
    let y = (y_coarse << 20) | (y_medium << 10) | y_fine;
    let z = (z_coarse << 20) | (z_medium << 10) | z_fine;

    return vec3<u32>(x, y, z);
}