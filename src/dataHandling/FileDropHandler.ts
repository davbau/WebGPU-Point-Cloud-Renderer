import {LAS_FILE_ENDINGS, LASHeader_small, SmallLASLoader} from "./SmallLASLoader";
import {BatchHandler} from "./BatchHandler";
import {vec2} from "webgpu-matrix";
import {log} from "console";
import {resetViewport} from "../main";
import {SIZE_OF_POINT} from "../types/c_equivalents";

export class FileDropHandler {
    /**
     * The container element where the files can be dropped.
     * @private
     */
    private container: HTMLElement;

    /**
     * The names of the loaded files. Duplicates are not allowed.
     * @private
     */
    private loadedFiles: string[];

    /**
     * The file loader used to load the las files.
     * @private
     */
    private lasLoader: SmallLASLoader;
    private device: GPUDevice;

    private screen_size: vec2.default;

    private batchHandler: BatchHandler;

    private files_to_load: ArrayBuffer[] = [];
    private file_headers_to_load: LASHeader_small[] = [];

    constructor(container: HTMLElement,
                device: GPUDevice,
                uniformBuffer: GPUBuffer,
                depthBuffer: GPUBuffer,
                frameBuffer: GPUBuffer,
                compute_depth_shader_bindGroupLayouts: GPUBindGroupLayout[],
                compute_shader_bindGroupLayouts: GPUBindGroupLayout[],
                screenSize: vec2.default,
                maxBufferSize: number) {
        this.container = container;
        this.lasLoader = new SmallLASLoader();
        this.loadedFiles = [];
        this.device = device;
        this.screen_size = screenSize;

        this.batchHandler = new BatchHandler(
            device,
            uniformBuffer,
            depthBuffer,
            frameBuffer,
            compute_depth_shader_bindGroupLayouts,
            compute_shader_bindGroupLayouts,
            maxBufferSize,
            screenSize
        );

        this.registerEvents();
    }

    /**
     * @returns The batch Handler used to store the loaded points.
     */
    getBatchHandler() {
        return this.batchHandler;
    }

    /**
     * Registers the events for dragging files over the {@link container} and dropping them.
     */
    registerEvents() {
        this.container.ondrop = (ev) => {
            this.dropHandler(ev);
        }
        this.container.ondragover = (ev) => {
            this.dragOverHandler(ev);
        }
    }

    /**
     * Handles the drop event. Uses the {@link loadDroppedFiles} method to load the dropped files.
     * @param ev
     */
    dropHandler(ev: DragEvent) {
        console.log("File(s) dropped");

        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();

        if (!ev.dataTransfer) {
            console.error("No data transfer");
            return;
        }

        const loadedFiles: File[] = [];

        if (ev.dataTransfer.items) {
            // Use DataTransferItemList interface to access the file(s)
            [...ev.dataTransfer.items].forEach((item, i) => {
                // If dropped items aren't files, reject them
                if (item.kind === "file") {
                    const file = item.getAsFile();
                    console.log(`… file[${i}].name = ${file!.name}`);
                    loadedFiles.push(file!);
                }
            });
        } else {
            // Use DataTransfer interface to access the file(s)
            [...ev.dataTransfer.files].forEach((file, i) => {
                console.log(`… file[${i}].name = ${file.name}`);
            });
        }

        this.loadDroppedFiles(loadedFiles);
    }

    /**
     * Loads the dropped files. Checks if the file is already loaded and if it has the las ending.
     * @param files
     */
    async loadDroppedFiles(files: File[]) {
        for (let file of files) {
            if (this.loadedFiles.includes(file.name)) {
                console.log("Already loaded file", file.name);
                continue;
            }
            if (!this.hasLasEnding(file.name)) {
                console.log("File does not have las ending", file.name);
                continue;
            }

            const header = await this.lasLoader.loadLasHeader(file);
            if(this.loadedFiles.length == 0) {
                const extent = [
                    header.minX, header.minY, header.minZ,
                    header.maxX, header.maxY, header.maxZ
                ];
                resetViewport(extent);
            }

            this.loadedFiles.push(file.name);
            this.file_headers_to_load.push(header);
            // this.files_to_load.push(await file.arrayBuffer());
            // take out point data from file
            const fileBuffer = await file.arrayBuffer();
            const nr_points = Number(header.numberOfPointRecords);
            const byteLengthOfPointsOnFile = nr_points * header.pointDataRecordLength;
            const points_buffer = fileBuffer.slice(header.offsetToPointData, header.offsetToPointData + byteLengthOfPointsOnFile);
            this.files_to_load.push(points_buffer);

            // let start = performance.now();
            // const points = await this.lasLoader.loadLasPointsAsBuffer(file, header);
            // let end = performance.now();
            // console.log("Transformed points in ", end - start, "ms");
            // console.log("got ", points, " points from ", file.name);
            //
            // let start2 = performance.now();
            // this.batchHandler.add(points).then(() => console.log("Added points to buffer"));
            // let end2 = performance.now();
            // console.log("Added points to buffer in ", end2 - start2, "ms");
            // this.loadedFiles.push(file.name);
        }
    }

    /**
     * Requests the next n points to load from the files. Will use the first file that has points left to load. (Queue-like behavior)
     *
     * After loading the points, they will be added to the batch handler and immediately written to the GPU.
     *
     * @param n the number of points to load.
     */
    requestNPointsToLoad(n: number) {
        if (this.files_to_load.length === 0) {
            // console.warn("No files to load");
            return;
        }

        // Get the first file that has points left to load
        const file = this.files_to_load[0];
        if (!file) {
            // throw new Error("No file loaded");
            // console.warn("No file to load points from");
            return;
        }
        const header = this.file_headers_to_load[0];
        if (!header) {
            return;
        }

        // Load the points from the file
        const byteLength_to_cut = n * header.pointDataRecordLength;
        const chunk = file.slice(0, byteLength_to_cut);
        const points = this.lasLoader.loadLasPointsAsBuffer_FromPointRecords(chunk, this.file_headers_to_load[0])
        if (points.byteLength === 0) {
            console.warn("No points loaded from file");
            // Remove the file from the queue if no points were loaded
            this.files_to_load.shift();
            this.file_headers_to_load.shift();
            return;
        }
        // Remove the loaded points from the file
        this.files_to_load[0] = file.slice(byteLength_to_cut);
        // this.batchHandler.add(points).then(() => {
        //     this.batchHandler.writeOneBufferToGPU().then(() => console.log("Successfully added points to batch buffer"));
        // });
        this.batchHandler.add(points);
        // this.batchHandler.writeOneBufferToGPU();
    }

    /**
     * Checks if the file has one of the las endings found in {@link LAS_FILE_ENDINGS}.
     * @param fileName the name of the file to check
     * @returns true if the file has one of the las endings, false otherwise
     */
    hasLasEnding(fileName: string): boolean {
        for (let lasFileEnding of LAS_FILE_ENDINGS) {
            if (fileName.endsWith(lasFileEnding)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Handles the drag over event. Prevents the default behavior.
     * @param ev
     */
    dragOverHandler(ev: DragEvent) {
        console.log("File(s) in drop zone");
        ev.preventDefault();
    }

    /**
     * Returns the names of the loaded files.
     * @returns {string[]} The names of the loaded files.
     */
    getFileNames(): string[] {
        return this.loadedFiles;
    }
}