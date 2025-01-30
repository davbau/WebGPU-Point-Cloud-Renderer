import {mat4, vec2, vec3} from "webgpu-matrix";

import {Util} from "./util";
import {create_and_bind_quad_VertexBuffer} from "./quad";
// Region pipeline
// import compute_shader from "./shaders/compute.wgsl";
import compute_shader from "./shaders/compute_multipleBuffers.wgsl";
// import compute_depth_shader from "./shaders/compute_depth_shader.wgsl";
import compute_depth_shader from "./shaders/compute_depth_shader_multipleBuffers.wgsl";
import display_shader from "./shaders/display_on_screan.wgsl";
import Stats from "stats.js";
import {SIZE_OF_POINT} from "./types/c_equivalents";
import {FileDropHandler} from "./FileDropHandler";
import {GUI} from "dat.gui";
import {BatchHandler} from "./BatchHandler";
import {InputHandlerInertialTurntableCamera} from "./InputHandler-InertialTurntableCamera";
import {InertialTurntableCamera} from "./InertialTurntableCamera";

const canvas = document.getElementById("gfx-main") as HTMLCanvasElement;
// // set max size of canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const debug_div = document.getElementById("debug") as HTMLElement;
const resetViewport_button = document.getElementById("btn-resetViewport") as HTMLButtonElement;

let screen_size = vec2.create(canvas.width, canvas.height);

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
// const BUFFER_HANDLER_SIZE = 65536; // for uniform
// const BUFFER_HANDLER_SIZE = ((7.5e4)) * SIZE_OF_POINT; // for storage
const BUFFER_HANDLER_SIZE = ((Math.pow(2, 20))) * SIZE_OF_POINT; // for storage 2^20 is about 1e6
// const BUFFER_HANDLER_SIZE = 2 * SIZE_OF_POINT;

// const THREADS_PER_WORKGROUP = 32;
const THREADS_PER_WORKGROUP = 64;
// const THREADS_PER_WORKGROUP = 128;

// const BUFFER_HANDLER_SIZE = 1048560; // for uniform
const container = document.getElementById("container") as HTMLDivElement;   // The container element
const fileDropHandler = new FileDropHandler(container, device, screen_size, BUFFER_HANDLER_SIZE);
let arrayBufferHandler = fileDropHandler.getArrayBufferHandler();

// Region GUI
const gui = new GUI();
// GUI parameters
const params: {
    renderQuality: 'auto' | 'coarse' | "medium" | "fine",
} = {
    renderQuality: 'auto',
};
gui.add(params, 'renderQuality', ['auto', 'coarse', "medium", "fine"]);

// Region vertex buffer
const quad_vertexBuffer = create_and_bind_quad_VertexBuffer(device);

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

let numberOfPoints = 0;

// const STAGING_BUFFER_SIZE = 1e6 * SIZE_OF_POINT;
const STAGING_BUFFER_SIZE = arrayBufferHandler.getBufferSize();
const stagingBuffer = device.createBuffer({
    size: STAGING_BUFFER_SIZE,
    usage: GPUBufferUsage.MAP_WRITE |
        GPUBufferUsage.COPY_SRC,
});

// Region Uniform
const uniformBuffer = device.createBuffer({
    label: "uniform buffer",
    size: 4 * Float32Array.BYTES_PER_ELEMENT    // canvas width, height, 2x padding
        + 16 * Float32Array.BYTES_PER_ELEMENT   // mVP
        + 4 * Float32Array.BYTES_PER_ELEMENT    // Batch origin
        + 4 * Float32Array.BYTES_PER_ELEMENT    // Batch size
        + 4 * Float32Array.BYTES_PER_ELEMENT,   // render type
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
});


// Region BindGroup
const compute_depth_shader_bindGroupLayout = compute_depth_pipeline.getBindGroupLayout(0);
compute_depth_shader_bindGroupLayout.label = "compute depth pipeline layout";
// let compute_depth_shader_bindGroup = Util.createBindGroup(device, compute_depth_shader_bindGroupLayout, [uniformBuffer, multiple_Buffer[currentUsedBufferIndex], depthBuffer]);

const compute_shader_bindGroupLayout = computePipeline.getBindGroupLayout(0);
compute_shader_bindGroupLayout.label = "compute pipeline layout";
// let compute_shader_bindGroup = Util.createBindGroup(device, compute_shader_bindGroupLayout, [uniformBuffer, multiple_Buffer[currentUsedBufferIndex], framebuffer, depthBuffer]);

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
const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
        const width = entry.contentBoxSize[0].inlineSize;
        const height = entry.contentBoxSize[0].blockSize;
        // const canvas = entry.target as HTMLCanvasElement;

        // clamp the size to the device limits
        canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
        canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));

        // update the aspect ratio and screen size for rendering
        aspect = canvas.width / canvas.height;
        screen_size = vec2.create(canvas.width, canvas.height);

        // update the camera aspect
        camera.resize(aspect);
    }
});
observer.observe(canvas);
let aspect = canvas.width / canvas.height;
console.log('aspect: ', aspect);

const camera = new InertialTurntableCamera(Math.PI / 4, aspect, 1, 100);

const inputHandler = new InputHandlerInertialTurntableCamera(canvas, camera);
inputHandler.registerInputHandlers();

const modelMatrix = mat4.identity();
const mVP = mat4.create();

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const initial_depthBuffer = new Float32Array(canvas.width * canvas.height).fill(0xFFFFFFFF);
// unmap depth buffer
depthBuffer.unmap();

const batchHandler = arrayBufferHandler as BatchHandler;

resetViewport_button.addEventListener("click", resetViewport);

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

async function generateFrame() {
    stats.begin();

    camera.tick();

    let commandEncoder = device.createCommandEncoder();

    // camera.zoom(0, 0, 0.001);

    // get mVP matrix
    // mat4.multiply(camera.getViewProjectionMatrix(), modelMatrix, mVP);
    mat4.multiply(camera.getProjectionMatrix(), camera.getViewMatrix(), mVP);
    mat4.multiply(mVP, modelMatrix, mVP);

    debug_div.innerText = `vp matrix: ${camera.getViewMatrix()}
    mvp matrix: ${mVP},
    `

    // reset depth buffer
    device.queue.writeBuffer(depthBuffer, 0, initial_depthBuffer.buffer, 0, initial_depthBuffer.byteLength);
    const upload_waiter = batchHandler.writeOneBufferToGPU();
    const batches_shown: number[] = [];
    const batches_renderType: number[] = [];

    for (const batch of batchHandler.getBatches()) {
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

        // Region Uniform
        // console.log(`batch.getOrigin() of batch ${batch.getID()}: `, batch.getOrigin());
        // console.log(`batch.getBoxSize() of batch ${batch.getID()}: `, batch.getBoxSize());
        const uniform_data = new Float32Array([
            screen_size[0], screen_size[1], 0, 0, // padding
            ...mVP,
            ...batch.getOrigin(), 0,
            ...batch.getBoxSize(), 0,
            accuracy_level, 0, 0, 0,
        ]);
        device.queue.writeBuffer(uniformBuffer, 0, uniform_data.buffer, uniform_data.byteOffset, uniform_data.byteLength);
        // const currentBuffer = multiple_Buffer[currentUsedBufferIndex];

        // let nr_pointsInCurrentBuffer = nrOfTestPoints;
        let nr_pointsInCurrentBuffer = batch.filledSize();

        // Region Workgroups
        const totalWorkGroups = Math.ceil(nr_pointsInCurrentBuffer / THREADS_PER_WORKGROUP);
        let xWorkGroups = 1;
        let yWorkGroups = 1;
        let zWorkGroups = 1;

        if (totalWorkGroups <= device.limits.maxComputeWorkgroupsPerDimension) {
            xWorkGroups = totalWorkGroups;
        } else if (totalWorkGroups <= Math.pow(device.limits.maxComputeWorkgroupsPerDimension, 2)) {
            yWorkGroups = Math.ceil(totalWorkGroups / device.limits.maxComputeWorkgroupsPerDimension);
            xWorkGroups = Math.ceil(totalWorkGroups / yWorkGroups);
        }

        // Region BindGroup
        /*
        const compute_depth_shader_bindGroup = Util.createBindGroup(device, compute_depth_shader_bindGroupLayout, [
            uniformBuffer,
            // testBuffer,
            batch.getPointsGpuBuffer(),
            depthBuffer
        ]);
        const compute_shader_bindGroup = Util.createBindGroup(device, compute_shader_bindGroupLayout, [
            uniformBuffer,
            // testBuffer,
            batch.getPointsGpuBuffer(),
            depthBuffer,
            framebuffer
        ]);
         */
        const compute_depth_shader_bindGroup = Util.createBindGroup(device, compute_depth_shader_bindGroupLayout, [
            uniformBuffer,
            depthBuffer,
            batch.getCoarseGPUBuffer(),
            batch.getMediumGPUBuffer(),
            batch.getFineGPUBuffer(),
        ]);
        const compute_shader_bindGroup = Util.createBindGroup(device, compute_shader_bindGroupLayout, [
            uniformBuffer,
            depthBuffer,
            framebuffer,
            batch.getCoarseGPUBuffer(),
            batch.getMediumGPUBuffer(),
            batch.getFineGPUBuffer(),
            batch.getColorGPUBuffer(),
        ]);

        // Region Compute Depth Pass
        const compute_depth_pass = commandEncoder.beginComputePass();
        compute_depth_pass.setPipeline(compute_depth_pipeline);
        compute_depth_pass.setBindGroup(0, compute_depth_shader_bindGroup);
        // compute_depth_pass.setBindGroup(0, test_depth_bindGroup);
        compute_depth_pass.dispatchWorkgroups(
            Math.max(1, xWorkGroups),
            Math.max(1, yWorkGroups),
            Math.max(1, zWorkGroups));
        compute_depth_pass.end();

        // Region Compute Pass
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, compute_shader_bindGroup);
        // computePass.setBindGroup(0, test_compute_bindGroup);
        computePass.dispatchWorkgroups(
            Math.max(1, xWorkGroups),
            Math.max(1, yWorkGroups),
            Math.max(1, zWorkGroups));
        computePass.end();

        device.queue.submit([commandEncoder.finish()]);
        commandEncoder = device.createCommandEncoder();

        numberOfPoints += nr_pointsInCurrentBuffer;

        debug_div.innerText = `Number of points: ${Util.segmentNumber(numberOfPoints)},
        Number of points per batch: ${Util.segmentNumber(batch.getBatchSize())},
        Number of batches: ${arrayBufferHandler.numberOfBuffers()},
        Batches shown: ${batches_shown.join("\t")},
        Batches render type: ${batches_renderType.join("\t")},
        TpW: ${THREADS_PER_WORKGROUP},
        Workgroups: ${xWorkGroups} x ${yWorkGroups} x ${zWorkGroups},
        vp matrix: ${camera.getViewMatrix()}
        mvp matrix: ${mVP},
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
