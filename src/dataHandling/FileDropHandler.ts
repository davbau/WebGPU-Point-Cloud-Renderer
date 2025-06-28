import {LAS_FILE_ENDINGS, SmallLASLoader} from "./SmallLASLoader";
import {BatchHandler} from "./BatchHandler";
import {vec2} from "webgpu-matrix";
import {log} from "console";
import {resetViewport} from "../main";

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
            console.log("loading las file", file, header);

            const points = await this.lasLoader.loadLasPointsAsBuffer(file, header);
            console.log("got ", points, " points from ", file.name);

            this.batchHandler.add(points).then(() => console.log("Added points to buffer"));
            this.loadedFiles.push(file.name);
        }
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