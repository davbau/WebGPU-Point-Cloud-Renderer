import {mat4, vec2, vec3} from "webgpu-matrix";

import {Util} from "./utils/util";
import {create_and_bind_quad_VertexBuffer} from "./utils/quad";
import Stats from "stats.js";
import {SIZE_OF_POINT} from "./types/c_equivalents";
import {FileDropHandler} from "./dataHandling/FileDropHandler";
import {GUI} from "dat.gui";
import {BatchHandler} from "./dataHandling/BatchHandler";
import {InputHandlerInertialTurntableCamera} from "./cameras/InputHandler-InertialTurntableCamera";
import {InertialTurntableCamera} from "./cameras/InertialTurntableCamera";

const canvas = document.getElementById("gfx-main") as HTMLCanvasElement;
// // set max size of canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const debug_div = document.getElementById("debug") as HTMLElement;

/**
 * The screen size used to calculate the aspect ratio of the camera.
 * This can change during runtime. The change is handled by the observer function {@link observer}.
 * @type {vec2.default}
 */
let screen_size: vec2.default = vec2.create(canvas.width, canvas.height);

const requestAdapterOptions = {
    powerPreference: 'high-performance',
} as GPURequestAdapterOptions;

const adapter = (await navigator.gpu.requestAdapter(requestAdapterOptions)) as GPUAdapter;
if (!adapter) {
    debug_div.innerText = "WebGPU is supported but no adapter found!";
    throw Error("Couldn't request WebGPU adapter.");
}

const k1Gigabyte = 1024 * 1024 * 1024;
const device = (await adapter.requestDevice(
    {
        requiredLimits: {
            maxBufferSize: 1 * k1Gigabyte,
            // maxComputeWorkgroupStorageSize: 65536
            maxStorageBufferBindingSize: 1 * k1Gigabyte,
            // maxDynamicStorageBuffersPerPipelineLayout: 6,
        },
        requiredFeatures: ['timestamp-query'],
    }
)) as GPUDevice;
console.log('Device: ', device);
const context = canvas.getContext("webgpu") as GPUCanvasContext;
const format = "bgra8unorm" as GPUTextureFormat;

context.configure({
    device,
    format,
});

const maxWorkgroupsPerDimension = device.limits.maxComputeWorkgroupsPerDimension;
const maxStorageBufferBindingSize = device.limits.maxStorageBufferBindingSize;

// Region Drag and Drop
// Read out url parameter for buffer handler size.
const urlParams = new URLSearchParams(window.location.search);
let handlerSizeParameter = urlParams.get('bSize');
let BUFFER_HANDLER_SIZE = ((Math.pow(2, 20))) * SIZE_OF_POINT; // for storage 2^20 is about 1e6
if (handlerSizeParameter) {
    handlerSizeParameter = handlerSizeParameter.toLowerCase();
    let decoded = 0;
    // if just a number is given, it is interpreted as bytes
    // if a number is given followed by k, m, g, it is interpreted as kilo, mega, giga bytes

    if (handlerSizeParameter.endsWith("k")) {
        decoded = parseInt(handlerSizeParameter.slice(0, -1)) * Math.pow(2, 10);
    } else if (handlerSizeParameter.endsWith("m")) {
        decoded = parseInt(handlerSizeParameter.slice(0, -1)) * Math.pow(2, 20);
    } else if (handlerSizeParameter.endsWith("g")) {
        decoded = parseInt(handlerSizeParameter.slice(0, -1)) * Math.pow(2, 30);
    } else {
        decoded = parseInt(handlerSizeParameter);
    }
    console.log(`size for buffer passed: ${decoded}`);

    // Force adherence to the device limits and Size of Point
    BUFFER_HANDLER_SIZE = Math.min(decoded, maxStorageBufferBindingSize);
    BUFFER_HANDLER_SIZE = BUFFER_HANDLER_SIZE - (BUFFER_HANDLER_SIZE % SIZE_OF_POINT);
}
console.log(`BUFFER_HANDLER_SIZE: ${BUFFER_HANDLER_SIZE / Math.pow(2, 20)}M`);

let THREADS_PER_WORKGROUP = 64;
let handler_threads_per_workgroup = urlParams.get('tpw');
if (handler_threads_per_workgroup) {
    console.log("tpw: ", handler_threads_per_workgroup);
    THREADS_PER_WORKGROUP = Math.max(
        Math.min(
            parseInt(handler_threads_per_workgroup),
            256
        ),
        1);
}

const container = document.getElementById("container") as HTMLDivElement;   // The container element

// Region GUI
const gui = new GUI();
// GUI parameters
const params: {
    renderQuality: 'auto' | 'coarse' | "medium" | "fine",
    show_debug_div: boolean,
} = {
    renderQuality: 'auto',
    show_debug_div: true,
};
gui.add(params, 'renderQuality', ['auto', 'coarse', "medium", "fine"]);
gui.add(params, 'show_debug_div').onChange((value) => setDebugDivVisibility(value));
gui.add({view_to_model: resetViewport}, 'view_to_model');

// Region vertex buffer
const quad_vertexBuffer = create_and_bind_quad_VertexBuffer(device);

// Region pipeline
const compute_bindGroupLayouts = Util.create_bindGroupLayouts_compute(device, "compute");
const compute_depth_bindGroupLayouts = Util.create_bindGroupLayouts_depth(device, "compute depth");

import compute_shader from "./shaders/compute_multipleBuffers.wgsl";

const compute_pipelines = Util.create_compute_Pipelines_with_settings(device, compute_shader, THREADS_PER_WORKGROUP, "compute", compute_bindGroupLayouts);


import compute_depth_shader from "./shaders/compute_depth_shader_multipleBuffers.wgsl";

const compute_depth_pipelines = Util.create_compute_Pipelines_with_settings(device, compute_depth_shader, THREADS_PER_WORKGROUP, "compute depth", compute_depth_bindGroupLayouts);


import display_shader from "./shaders/display_on_screan.wgsl";
import {log} from "console";

const display_shaderModule = device.createShaderModule({
    label: "display shader module",
    code: display_shader
});
const displayPipelineDescriptor = Util.createPipelineDescriptor_pos4_uv2(device, display_shaderModule, "vs_main", "fs_main", format);
displayPipelineDescriptor.label = "display pipeline descriptor";
displayPipelineDescriptor.primitive = {topology: 'triangle-strip'};
const displayPipeline = device.createRenderPipeline(displayPipelineDescriptor);

// Region Framebuffer
let framebuffer = device.createBuffer({
    label: "framebuffer",
    size: canvas.width * canvas.height * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: false,
});

let depthBuffer = device.createBuffer({
    label: "depth buffer",
    size: canvas.width * canvas.height * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: false,
});

// Region Debug Buffers
/*
// Some buffers for debugging, I will not remove them because they might be useful in the future.
const show_debug_buffers = false;
const debug_framebuffer = device.createBuffer({
    label: "debug framebuffer",
    size: canvas.width * canvas.height * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});

const debug_depthBuffer = device.createBuffer({
    label: "debug depth buffer",
    size: canvas.width * canvas.height * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});

const debug_uniformBuffer = device.createBuffer({
    label: "debug uniform buffer",
    size: 4 * Float32Array.BYTES_PER_ELEMENT    // canvas width, height, 2x padding
        + 16 * Float32Array.BYTES_PER_ELEMENT   // mVP
        + 4 * Float32Array.BYTES_PER_ELEMENT    // Batch origin
        + 4 * Float32Array.BYTES_PER_ELEMENT    // Batch size
        + 4 * Float32Array.BYTES_PER_ELEMENT,   // render type
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});

// const STAGING_BUFFER_SIZE = 1e6 * SIZE_OF_POINT;
const STAGING_BUFFER_SIZE = batchHandler.getBufferSize();
const stagingBuffer = device.createBuffer({
    size: STAGING_BUFFER_SIZE,
    usage: GPUBufferUsage.MAP_WRITE |
        GPUBufferUsage.COPY_SRC,
});
 */
// End Region Debug Buffers


// Region Uniform
const dynamicUniformAlignment = device.limits.minUniformBufferOffsetAlignment;
const uniformBuffer = device.createBuffer({
    label: "uniform buffer",
    size: 4 * Float32Array.BYTES_PER_ELEMENT    // canvas width, height, 2x padding
        + 16 * Float32Array.BYTES_PER_ELEMENT   // mVP
        + 4 * Float32Array.BYTES_PER_ELEMENT    // Batch origin
        + 4 * Float32Array.BYTES_PER_ELEMENT    // Batch size
        + 4 * Float32Array.BYTES_PER_ELEMENT,   // render type
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
});

export const uniformBufferSizeWithAlignment = Math.ceil(uniformBuffer.size / dynamicUniformAlignment) * dynamicUniformAlignment;
let dynamicUniformBuffer = device.createBuffer({
    label: "dynamic uniform buffer",
    size: uniformBufferSizeWithAlignment * 30,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
});

function updateDynamicUniformBuffer(batchHandler: BatchHandler, mvp: Float32Array) {
    // TODO: check if we need to rebuild the dynamic uniform buffer (more data loaded between frames)

    // const batchRenderModes = batchHandler.getRenderModesOfBatches(mvp);
    const dynamicUniformData = new Float32Array(dynamicUniformBuffer.size / Float32Array.BYTES_PER_ELEMENT);
    let offset = 0;
    for (let i = 0; i < batchHandler.numberOfBuffers(); i++) {
        const batch = batchHandler.getBatch(i);
        const currentBatch = new Float32Array([
            screen_size[0], screen_size[1], 0, 0, // padding
            ...mvp,
            ...batch.getOrigin(), 0,
            ...batch.getBoxSize(), 0,
            // batchRenderModes[i], 0, 0, 0, // I don't use rendermode in shaders anymore but might switch back because the pipelines are much more confusing now and I haven't seen any performance difference
            0, 0, 0, 0
        ]);

        dynamicUniformData.set(currentBatch, offset);
        // offset += uniformBufferSizeWithAlignment;
        offset += uniformBufferSizeWithAlignment / Float32Array.BYTES_PER_ELEMENT;
    }

    device.queue.writeBuffer(dynamicUniformBuffer, 0, dynamicUniformData.buffer, dynamicUniformData.byteOffset, dynamicUniformData.byteLength);
}


// Region BindGroup
// const compute_depth_shader_bindGroupLayouts = compute_depth_pipelines.map(pipeline => pipeline.getBindGroupLayout(0));
// compute_depth_shader_bindGroupLayouts.forEach((layout, index) => {
//     layout.label = "compute depth pipeline layout" +
//         (index === 0 ? " coarse" : index === 1 ? " medium" : " fine")
// });
//
// const compute_shader_bindGroupLayouts = compute_pipelines.map(pipeline => pipeline.getBindGroupLayout(0));
// compute_shader_bindGroupLayouts.forEach((layout, index) => {
//     layout.label = "compute pipeline layout" +
//         (index === 0 ? " coarse" : index === 1 ? " medium" : " fine")
// });

const display_pipelineLayout = displayPipeline.getBindGroupLayout(0);
display_pipelineLayout.label = "display pipeline layout";
const display_shader_bindGroup = device.createBindGroup({
    label: "display bind group",
    layout: display_pipelineLayout,
    entries: [
        {
            binding: 0,
            resource: {
                buffer: dynamicUniformBuffer,
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
/**
 * Observer function to handle the resizing of the canvas.
 * The observer function is called when the canvas is resized.
 * The size of the canvas is stored in the {@link screen_size} variable.
 */
const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
        const width = entry.contentBoxSize[0].inlineSize;
        const height = entry.contentBoxSize[0].blockSize;

        // clamp the size to the device limits
        canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
        canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));

        // update the aspect ratio and screen size for rendering
        aspect = canvas.width / canvas.height;
        screen_size[0] = canvas.width;
        screen_size[1] = canvas.height;

        // update the camera aspect
        camera.resize(aspect);
    }
});
observer.observe(canvas);
/**
 * The aspect ratio of the camera.
 * Calculated using the width and height of the canvas initially, is updated when the canvas is resized.
 */
let aspect = canvas.width / canvas.height;
console.log('aspect: ', aspect);

// Region setup camera and handlers
/**
 * The camera used to view the scene.
 * The behaviour of the camera can be easily changed by writing a new camera class.
 */
const camera = new InertialTurntableCamera(Math.PI / 4, aspect, 1, 100);

const inputHandler = new InputHandlerInertialTurntableCamera(canvas, camera);
inputHandler.registerInputHandlers();

const modelMatrix = mat4.identity();
const mVP = mat4.create();

const fileDropHandler = new FileDropHandler(
    container,
    device,
    dynamicUniformBuffer,
    depthBuffer,
    framebuffer,
    compute_depth_bindGroupLayouts,
    compute_bindGroupLayouts,
    screen_size,
    BUFFER_HANDLER_SIZE);
let batchHandler = fileDropHandler.getBatchHandler();

// Region setup stats
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

/**
 * Reset the viewport so that the model is in the center of the view.
 * This function is called when the user presses the "view to model" button.
 */
function resetViewport() {
    // figure out extent of the model
    const modelExtent = batchHandler.getTotalModelExtent();
    console.log(`model extent: ${modelExtent}`);

    // set camera so that the model is in the center of the view
    let modelCenter = vec3.create(
        (modelExtent[0] + modelExtent[3]) / 2,
        (modelExtent[1] + modelExtent[4]) / 2,
        (modelExtent[2] + modelExtent[5]) / 2,
    );
    console.log(`model center: ${modelCenter}`);

    // set camera so that the model is in the view
    const modelSize = vec3.create(
        modelExtent[3] - modelExtent[0],
        modelExtent[4] - modelExtent[1],
        modelExtent[5] - modelExtent[2],
    );

    const modelSizeMax = Math.max(modelSize[0], modelSize[1], modelSize[2]);
    const modelSizeMin = Math.min(modelSize[0], modelSize[1], modelSize[2]);

    console.log(`modelSizeMax: ${modelSizeMax}, modelSizeMin: ${modelSizeMin}`);

    // const distance = modelSizeMax / Math.tan(camera.fov / 2);
    const fovX = camera.fov * camera.aspect;
    // technically it would be correct to divide modelSizeMax by 2 because the calculation uses a right angle triangle,
    // however it looks better if the model is in the center of the view occupying half of the view instead of the whole view.
    const distance = (modelSizeMax / 1) / Math.tan(fovX / 2);

    console.log(`Center: ${modelCenter}, Distance: ${distance}`);

    camera.reset();
    camera.tick({
        center: modelCenter,
        // distance: distance,
    });
    camera.tick({
        distance: distance,
    })

    console.log("camera: ", camera.getParams());
}

const initial_depthBuffer = new Float32Array(canvas.width * canvas.height).fill(0xFFFFFFFF);
// device.queue.writeBuffer(depthBuffer, 0, initial_depthBuffer.buffer, 0, initial_depthBuffer.byteLength);
// unmap depth buffer
depthBuffer.unmap();

let numberOfPoints = 0;

/**
 * The main function that generates the frame. This function is called recursively using requestAnimationFrame.
 */
async function generateFrame() {
    // update stats
    stats.begin();
    // update camera
    camera.tick();

    let commandEncoder = device.createCommandEncoder();

    // get mVP matrix
    mat4.multiply(camera.getProjectionMatrix(), camera.getViewMatrix(), mVP);
    mat4.multiply(mVP, modelMatrix, mVP);

    // reset depth buffer
    device.queue.writeBuffer(depthBuffer, 0, initial_depthBuffer.buffer, 0, initial_depthBuffer.byteLength);
    const upload_waiter = batchHandler.writeOneBufferToGPU();
    const batches_shown: number[] = [];
    const batches_renderType: number[] = [];

    // update dynamic uniform buffer
    updateDynamicUniformBuffer(batchHandler, mVP);
    // update uniform buffer for display pass
    // building the uniform buffer data
    // const uniform_data = new Float32Array([
    //     screen_size[0], screen_size[1], 0, 0, // padding
    //     ...mVP,
    //     0, 0, 0, 0,
    //     0, 0, 0, 0,
    //     0, 0, 0, 0,
    // ]);
    // device.queue.writeBuffer(uniformBuffer, 0, uniform_data.buffer, uniform_data.byteOffset, uniform_data.byteLength);


    // Workgroup initial values for later
    let xWorkGroups = 1;
    let yWorkGroups = 1;
    let zWorkGroups = 1;

    // go through all the batches and render visible ones
    for (const batch of batchHandler.getBatches()) {
        // if (!batch.isWrittenToGPU() || batch.getID() != 0) {
        if (!batch.isWrittenToGPU()) {
            continue;
        }
        if (!batch.isOnScreen(mVP)) {
            // console.log(`batch ${batch.getID()} not on screen`);
            batches_renderType.push(-1);
            continue;
        } else {
            batches_shown.push(batch.getID());
        }

        // Region accuracy Level
        let accuracy_level = 2;
        switch (params.renderQuality) {
            case "auto":
                accuracy_level = batch.getAccuracyLevel(mVP);
                break;
            case "coarse":
                accuracy_level = 0;
                break;
            case "medium":
                accuracy_level = 1;
                break;
            case "fine":
                accuracy_level = 2;
                break;
        }
        batches_renderType.push(accuracy_level);

        const compute_depth_pipeline = compute_depth_pipelines[accuracy_level];

        // Region Uniform
        // // building the uniform buffer data
        // const uniform_data = new Float32Array([
        //     screen_size[0], screen_size[1], 0, 0, // padding
        //     ...mVP,
        //     ...batch.getOrigin(), 0,
        //     ...batch.getBoxSize(), 0,
        //     accuracy_level, 0, 0, 0,
        // ]);
        // device.queue.writeBuffer(uniformBuffer, 0, uniform_data.buffer, uniform_data.byteOffset, uniform_data.byteLength);

        let nr_pointsInCurrentBuffer = batch.filledSize();

        // Region Workgroups
        const totalWorkGroups = Math.ceil(nr_pointsInCurrentBuffer / THREADS_PER_WORKGROUP);

        if (totalWorkGroups <= device.limits.maxComputeWorkgroupsPerDimension) {
            xWorkGroups = totalWorkGroups;
        } else if (totalWorkGroups <= Math.pow(device.limits.maxComputeWorkgroupsPerDimension, 2)) {
            yWorkGroups = Math.ceil(totalWorkGroups / device.limits.maxComputeWorkgroupsPerDimension);
            xWorkGroups = Math.ceil(totalWorkGroups / yWorkGroups);
        }

        const compute_depth_shader_bindGroup = batch.get_depth_bindGroup(accuracy_level);

        // Region Compute Depth Pass
        const compute_depth_pass = commandEncoder.beginComputePass();
        compute_depth_pass.setPipeline(compute_depth_pipeline);
        compute_depth_pass.setBindGroup(0, compute_depth_shader_bindGroup, [batch.getID() * uniformBufferSizeWithAlignment]);
        // compute_depth_pass.setBindGroup(0, compute_depth_shader_bindGroup, [256]);
        compute_depth_pass.dispatchWorkgroups(
            Math.max(1, xWorkGroups),
            Math.max(1, yWorkGroups),
            Math.max(1, zWorkGroups));
        compute_depth_pass.end();

        device.queue.submit([commandEncoder.finish()]);
        commandEncoder = device.createCommandEncoder();

        numberOfPoints += nr_pointsInCurrentBuffer;
    }

    // Workgroup initial values for later
    xWorkGroups = 1;
    yWorkGroups = 1;
    zWorkGroups = 1;

    // go through all the batches and render visible ones
    for (const batch of batchHandler.getBatches()) {
        // if (!batch.isWrittenToGPU() || batch.getID() != 0) {
        if (!batch.isWrittenToGPU()) {
            continue;
        }
        if (!batch.isOnScreen(mVP)) {
            // console.log(`batch ${batch.getID()} not on screen`);
            // batches_renderType.push(-1);
            continue;
        } else {
            // batches_shown.push(batch.getID());
        }

        // Region accuracy Level
        let accuracy_level = 2;
        switch (params.renderQuality) {
            case "auto":
                accuracy_level = batch.getAccuracyLevel(mVP);
                break;
            case "coarse":
                accuracy_level = 0;
                break;
            case "medium":
                accuracy_level = 1;
                break;
            case "fine":
                accuracy_level = 2;
                break;
        }
        // batches_renderType.push(accuracy_level);

        const computePipeline = compute_pipelines[accuracy_level];

        // Region Uniform
        // building the uniform buffer data
        // const uniform_data = new Float32Array([
        //     screen_size[0], screen_size[1], 0, 0, // padding
        //     ...mVP,
        //     ...batch.getOrigin(), 0,
        //     ...batch.getBoxSize(), 0,
        //     accuracy_level, 0, 0, 0,
        // ]);
        // device.queue.writeBuffer(uniformBuffer, 0, uniform_data.buffer, uniform_data.byteOffset, uniform_data.byteLength);

        let nr_pointsInCurrentBuffer = batch.filledSize();

        // Region Workgroups
        const totalWorkGroups = Math.ceil(nr_pointsInCurrentBuffer / THREADS_PER_WORKGROUP);

        if (totalWorkGroups <= device.limits.maxComputeWorkgroupsPerDimension) {
            xWorkGroups = totalWorkGroups;
        } else if (totalWorkGroups <= Math.pow(device.limits.maxComputeWorkgroupsPerDimension, 2)) {
            yWorkGroups = Math.ceil(totalWorkGroups / device.limits.maxComputeWorkgroupsPerDimension);
            xWorkGroups = Math.ceil(totalWorkGroups / yWorkGroups);
        }

        const compute_shader_bindGroup = batch.get_compute_bindGroup(accuracy_level);


        // Region Compute Pass
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, compute_shader_bindGroup, [batch.getID() * uniformBufferSizeWithAlignment]);
        // computePass.setBindGroup(0, compute_shader_bindGroup, [256]);
        computePass.dispatchWorkgroups(
            Math.max(1, xWorkGroups),
            Math.max(1, yWorkGroups),
            Math.max(1, zWorkGroups));
        computePass.end();

        device.queue.submit([commandEncoder.finish()]);
        commandEncoder = device.createCommandEncoder();

        // numberOfPoints += nr_pointsInCurrentBuffer;
    }

    if (debug_div.checkVisibility()) {
        debug_div.innerText = `Number of points: ${Util.segmentNumber(numberOfPoints)},
        Number of points per batch: ${Util.segmentNumber(batchHandler.getBatch(0).getBatchSize())},
        Number of batches: ${batchHandler.numberOfBuffers()},
        Batches shown: ${batches_shown.join("\t")},
        Batches render type: ${batches_renderType.join("\t")},
        TpW: ${THREADS_PER_WORKGROUP},
        Workgroups: ${xWorkGroups} x ${yWorkGroups} x ${zWorkGroups},
        vp matrix: 
        ${formatF32ArrayAsMatrix(camera.getViewMatrix())}
        mvp matrix: 
        ${formatF32ArrayAsMatrix(mVP)},
        `;
    }

    // reset viewport
    (display_renderPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0]
        .view = context.getCurrentTexture().createView();

    // Region Display Pass
    const displayPass = commandEncoder.beginRenderPass(display_renderPassDescriptor);
    displayPass.setPipeline(displayPipeline);
    displayPass.setBindGroup(0, display_shader_bindGroup);
    displayPass.setVertexBuffer(0, quad_vertexBuffer);
    displayPass.draw(4, 1, 0, 0);
    displayPass.end();

    // unmap framebuffer
    commandEncoder.clearBuffer(framebuffer, 0, framebuffer.size);
    framebuffer.unmap();

    device.queue.submit([commandEncoder.finish()]); // submit
    numberOfPoints = 0;

    await upload_waiter;
    stats.end();

    requestAnimationFrame(generateFrame);
}

requestAnimationFrame(generateFrame);

function formatF32ArrayAsMatrix(float32Array: Float32Array): string {
    const helper = mat4.transpose(float32Array);
    let string = "";
    for (let i = 0; i < float32Array.length; i++) {
        string += helper[i].toFixed(2) + ",\t   ";
        if ((i + 1) % 4 == 0 && i != 0) {
            string += "\n";
        }
    }
    return string;
}

function setDebugDivVisibility(visible: boolean) {
    debug_div.style.display = visible ? "block" : "none";
}