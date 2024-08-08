import {mat4, vec3, vec2} from "webgpu-matrix";

import Camera from "./camera";
import {Util} from "./util";
import {create_and_bind_quad_VertexBuffer, quad_vertex_array} from "./quad";

// Region Drag and Drop
const container = document.getElementById("container") as HTMLDivElement;   // The container element
const fileDropHandler = new FileDropHandler(container);

// End Region Drag and Drop

const canvas = document.getElementById("gfx-main") as HTMLCanvasElement;
const debug_div = document.getElementById("debug") as HTMLElement;

const adapter = (await navigator.gpu.requestAdapter()) as GPUAdapter;
if (!adapter) {
    debug_div.innerText = "WebGPU is supported but no adapter found!";
    throw Error("Couldn't request WebGPU adapter.");
}

const k1Gigabyte = 1024 * 1024 * 1024;
const device = (await adapter.requestDevice(
    {
        requiredLimits: {
            // maxBufferSize: 2 * k1Gigabyte,
            // maxComputeWorkgroupStorageSize: 65536
            // maxStorageBufferBindingSize: 2 * k1Gigabyte,
        },
    }
)) as GPUDevice;
console.log('Device: ', device);
const context = canvas.getContext("webgpu") as GPUCanvasContext;
const format = "bgra8unorm" as GPUTextureFormat;

context.configure({
    device,
    format,
});

// Region LAS FILE
import {SmallLASLoader} from "./SmallLASLoader";

const file_path = "./src/las_models/lion.las";
const lassLoader = new SmallLASLoader();
const las_header = await lassLoader.loadLASHeader(file_path);
console.log('LAS header: ', las_header);

// const las_points = await lassLoader.loadLASPoints(file_path, las_header);
// console.log('LAS points: ', las_points);

// const las_points_as_buffer = await lassLoader.loadLASPointsAsBufferPoints(file_path, las_header);
// console.log('LAS points as buffer: ', las_points_as_buffer);

const las_points_as_points = await lassLoader.loadLasPointsAsPoints(file_path, las_header);
// console.log('LAS points as points: ', las_points_as_points);

// Region vertex buffer
const quad_vertexBuffer = create_and_bind_quad_VertexBuffer(device);

// Region pipeline
import compute_shader from "./shaders/compute.wgsl";

const computeShaderModule = device.createShaderModule({
    label: "compute shader module",
    code: compute_shader
});
const computePipeline = device.createComputePipeline({
    label: "compute pipeline",
    layout: 'auto',
    compute: {
        module: computeShaderModule,
        entryPoint: "main"
    }
});


import compute_depth_shader from "./shaders/compute_depth_shader.wgsl";

const compute_depth_shaderModule = device.createShaderModule({
    label: "compute depth shader module",
    code: compute_depth_shader,
});
const compute_depth_pipeline = device.createComputePipeline({
    label: "compute depth pipeline",
    layout: 'auto',
    compute: {
        module: compute_depth_shaderModule,
        entryPoint: "main"
    }
})


import display_shader from "./shaders/display_on_screan.wgsl";

const display_shaderModule = device.createShaderModule({
    label: "display shader module",
    code: display_shader
});
const displayPipelineDescriptor = Util.createPipelineDescriptor_pos4_uv2(device, display_shaderModule, "vs_main", "fs_main", format);
displayPipelineDescriptor.label = "display pipeline descriptor";
displayPipelineDescriptor.primitive = {topology: 'triangle-strip'};
const displayPipeline = device.createRenderPipeline(displayPipelineDescriptor);

// Region Framebuffer
const framebuffer = device.createBuffer({
    label: "framebuffer",
    size: canvas.width * canvas.height * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});

const depthBuffer = device.createBuffer({
    label: "depth buffer",
    size: canvas.width * canvas.height * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});
// new Float32Array(depthBuffer.getMappedRange()).fill(0xFFFFFFFF);
// depthBuffer.unmap();
// Region Storage Buffer

function createRandomPoints(n: number): Point[] {
    const points: Point[] = [];
    const white: u_int32 = 0xffffff;
    // (255, 255, 255) = white
    console.log('white: ', white);
    for (let i = 0; i < n; i++) {
        points.push({
            x: randomNumberBetween(0, 1),
            y: randomNumberBetween(0, 1),
            z: randomNumberBetween(0, 1),
            color: ((Math.random() * 0xff) << 16)
                + ((Math.random() * 0xff) << 8)
                + (Math.random() * 0xff << 0),
            // color: 0x0f0f0f,
        });
    }
    return points;
}

// Create points in a line (x-axis)
function createDepthBufferTest(n: number): Point[] {
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

function randomOneOfTwoNumbers(a: number, b: number): number {
    return Math.random() > 0.5 ? a : b;
}

function randomNumberBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function convertPointsToArrayBuffer(points: Point[]): ArrayBuffer {
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

// max number of points is 2^16 - 1
const NUMBER_OF_POINTS = 2e5;
const maxWorkgroups = 2 ** 16 - 1;
// const points = createRandomPoints(NUMBER_OF_POINTS);
// const pointsArr = convertPointsToArrayBuffer(createDepthBufferTest(NUMBER_OF_POINTS));
// const pointsArr = convertPointsToArrayBuffer(createRandomPoints(NUMBER_OF_POINTS));

// const pointsArr = convertPointsToArrayBuffer(las_points_as_points);
const pointsArr = await lassLoader.loadLASPointsAsBuffer(file_path, las_header);

const numberOfPoints = pointsArr.byteLength / (4 * Float32Array.BYTES_PER_ELEMENT);
const pointsOverWorkgroups = numberOfPoints / Math.min(numberOfPoints, maxWorkgroups)

console.log('points written to GPU: ', pointsArr);
const pointsBuffer = device.createBuffer({
    label: "points buffer",
    // size: points.length * 16,
    // size: las_points_as_buffer.byteLength,
    // size: las_points_as_points.length * 16,
    size: pointsArr.byteLength,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
});
// console.log(points);
new Float32Array(pointsBuffer.getMappedRange()).set(new Float32Array(pointsArr));
pointsBuffer.unmap();

// Region Uniform
const uniformBuffer = device.createBuffer({
    label: "uniform buffer",
    size: 4 * Float32Array.BYTES_PER_ELEMENT + 16 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Region BindGroup
const compute_depth_shader_bindGroupLayout = compute_depth_pipeline.getBindGroupLayout(0);
compute_depth_shader_bindGroupLayout.label = "compute depth pipeline layout";
const compute_depth_shader_bindGroup = Util.createBindGroup(device, compute_depth_shader_bindGroupLayout, [uniformBuffer, pointsBuffer, depthBuffer]);

const compute_shader_bindGroupLayout = computePipeline.getBindGroupLayout(0);
compute_shader_bindGroupLayout.label = "compute pipeline layout";
const compute_shader_bindGroup = Util.createBindGroup(device, compute_shader_bindGroupLayout, [uniformBuffer, pointsBuffer, framebuffer, depthBuffer]);

const display_pipelineLayout = displayPipeline.getBindGroupLayout(0);
display_pipelineLayout.label = "display pipeline layout";
const display_shader_bindGroup = device.createBindGroup({
    label: "display bind group",
    layout: display_pipelineLayout,
    entries: [
        {
            binding: 0,
            resource: {
                buffer: uniformBuffer,
            }
        },
        {
            binding: 1,
            resource: {
                buffer: framebuffer,
            }
        },
    ]
});

// Region RenderPassDescriptor
const display_renderPassDescriptor = Util.create_display_RenderPassDescriptor(context, [0, 0, 0, 1]);

// Region frame
const aspect = canvas.width / canvas.height;
// const camera = new BlenderCamera(60, aspect, 0.1, 100);
// const inputHandler = new InputHandler(canvas, camera);
// inputHandler.registerInputHandlers();
// camera.moveCameraBase([0, 0, -2]);

// const camera = new BlenderCamera(30, aspect, 0.1, 100);
const camera = new BlenderCamera(Math.PI / 4, aspect, 1, 100);

// camera.moveCameraBase([0, 0, -10]);
// camera.moveCameraBase([0, 3, 0]);

const inputHandler = new InputHandler(canvas, camera);
inputHandler.registerInputHandlers();

/*
// const camera = new Camera(60, aspect, 0.1, 100);
// const camera = new FPSCamera(60, aspect, 0.1, 100);
// camera.translateCamera(0, -1, -2);
// camera.translateCamera(0, 0, -2);

// camera.moveUp(2);
// camera.moveForward(-5);
// camera.fixedRotate(0, Math.PI / 2);

let mouseHeld = false;
canvas.addEventListener('pointerdown', () => {
    mouseHeld = true;
});
canvas.addEventListener('pointerup', () => {
    mouseHeld = false;
});
canvas.addEventListener('pointermove', (event) => {
    if (mouseHeld) {
        // old camera
        // camera.rotateCamera(0, 1, 0, event.movementX);
        // camera.rotateCamera(1, 0, 0, -event.movementY);

        // new camera
        // camera.rotate(event.movementY, -event.movementX);
    }
});
*/

const modelMatrix = mat4.identity();
const mVP = mat4.create();
const screen_size = vec2.create(canvas.width, canvas.height);

import Stats from "stats.js";
import {FPSCamera} from "./FPSCamera";
import {Point, u_int32} from "./types/c_equivalents";

import {InputHandler} from "./InputHandler";
import {BlenderCamera} from "./BlenderCamera";
import {FileDropHandler} from "./FileDropHandler";

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// camera.update(0, 0, 0);

// mat4.rotate(modelMatrix, [-1, 0, 0], Math.PI / 2, modelMatrix);
mat4.rotate(modelMatrix, [0, 0, 1], 90 * Math.PI / 180, modelMatrix);
mat4.rotate(modelMatrix, [0, 1, 0], 180 * Math.PI / 180, modelMatrix);

// mat4.rotate(modelMatrix, [0, 0, 1], 90 * Math.PI / 180, modelMatrix);

mat4.translate(modelMatrix, [-0.5, -0.5, 0.5], modelMatrix);


const initial_depthBuffer = new Float32Array(canvas.width * canvas.height).fill(0xFFFFFFFF);
// unmap depth buffer
depthBuffer.unmap();

function generateFrame() {
    stats.begin();
    const commandEncoder = device.createCommandEncoder();

    mat4.multiply(camera.getViewProjectionMatrix(), modelMatrix, mVP);

    debug_div.innerText = `Number of points: ${numberOfPoints}
    Number of workgroups: ${Math.min(numberOfPoints, maxWorkgroups)}
    Points / Workgroup: ${pointsOverWorkgroups}
    Camera Matrix is \n${formatF32Array(camera.getViewMatrix())} \n
    MVP Matrix is \n${formatF32Array(mVP)} \n
    Model Matrix is \n${formatF32Array(modelMatrix)}`;

    const uniform_data = new Float32Array([
        screen_size[0], screen_size[1],
        0, 0, // padding
        ...mVP
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, uniform_data.buffer, uniform_data.byteOffset, uniform_data.byteLength);

    device.queue.writeBuffer(depthBuffer, 0, initial_depthBuffer.buffer, 0, initial_depthBuffer.byteLength);

    // Compute depth
    const compute_depth_pass = commandEncoder.beginComputePass();
    compute_depth_pass.setPipeline(compute_depth_pipeline);
    compute_depth_pass.setBindGroup(0, compute_depth_shader_bindGroup);
    // computePass.dispatchWorkgroups(Math.min(numberOfPoints, maxWorkgroups));
    compute_depth_pass.dispatchWorkgroups(Math.min(numberOfPoints, maxWorkgroups), Math.min(Math.ceil(pointsOverWorkgroups), maxWorkgroups), 1);
    compute_depth_pass.end();

    // Compute
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, compute_shader_bindGroup);
    // computePass.dispatchWorkgroups(Math.min(numberOfPoints, maxWorkgroups));
    computePass.dispatchWorkgroups(Math.min(numberOfPoints, maxWorkgroups), Math.min(Math.ceil(pointsOverWorkgroups), maxWorkgroups), 1);
    computePass.end();

    // reset viewport
    (display_renderPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0]
        .view = context.getCurrentTexture().createView();

    // Display
    const displayPass = commandEncoder.beginRenderPass(display_renderPassDescriptor);
    displayPass.setPipeline(displayPipeline);   // set the pipeline
    displayPass.setBindGroup(0, display_shader_bindGroup);
    displayPass.setVertexBuffer(0, quad_vertexBuffer);
    displayPass.draw(4, 1, 0, 0);
    displayPass.end();

    // unmap framebuffer
    commandEncoder.clearBuffer(framebuffer, 0, framebuffer.size);
    framebuffer.unmap();
    depthBuffer.unmap();

    // submit
    device.queue.submit([commandEncoder.finish()]);

    stats.end();

    requestAnimationFrame(generateFrame);
}

requestAnimationFrame(generateFrame);

function formatF32Array(float32Array: Float32Array): string {
    const helper = mat4.transpose(float32Array);
    let string = "";
    for (let i = 0; i < float32Array.length; i++) {
        string += limitToNDecimals(helper[i], 2) + ",\t   ";
        if ((i + 1) % 4 == 0 && i != 0) {
            string += "\n";
        }
    }
    return string;
    // return Array.from(float32Array).map((x) => x.toString()).join(",\n");
}

function limitToNDecimals(x: number, n: number): number {
    return Math.round(x * Math.pow(10, n)) / Math.pow(10, n);
}