/**
 * The vertex array for the full-screen quad.
 */
const quad_vertex_array = new Float32Array([
    -1, -1, 0, 1, 0, 0,
    1, -1, 0, 1, 1, 0,
    -1, 1, 0, 1, 0, 1,
    1, 1, 0, 1, 1, 1,
]);

const quad_vertex_size = 6 * 4;
const quad_position_offset = 0;
const quad_uv_offset = 4 * 4;
const quad_vertex_count = 4;

/**
 * Create and bind the vertex buffer for the full-screen quad. Load the vertex array into the buffer.
 * @param device The GPU device.
 */
function create_and_bind_quad_VertexBuffer(device: GPUDevice) {
    const quad_vertexBuffer = device.createBuffer({
        label: "quad vertex buffer",
        size: quad_vertex_array.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(quad_vertexBuffer.getMappedRange()).set(quad_vertex_array);
    quad_vertexBuffer.unmap();

    return quad_vertexBuffer;
}

export {quad_vertex_array, create_and_bind_quad_VertexBuffer};