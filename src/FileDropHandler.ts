import {LAS_FILE_ENDINGS, SmallLASLoader} from "./SmallLASLoader";
import {ArrayBufferHandler} from "./ArrayBufferHandler";
import {BatchHandler, DataHandler} from "./BatchHandler";
import {vec2} from "webgpu-matrix";

export class FileDropHandler {
    private container: HTMLElement;
    private loadedFiles: string[];
    private loadedArrayBuffers: ArrayBuffer[];
    private lasLoader: SmallLASLoader;
    private device: GPUDevice;
    private screen_size: vec2.default;

    private dataHandler: DataHandler;

    constructor(container: HTMLElement, device: GPUDevice, screenSize: vec2.default, maxBufferSize: number) {
        this.container = container;
        this.lasLoader = new SmallLASLoader();
        this.loadedFiles = [];
        this.loadedArrayBuffers = [];
        // this.isArrayBufferClaimed = [];
        this.device = device;
        this.screen_size = screenSize;

        this.dataHandler = new BatchHandler(
            device,
            maxBufferSize,
            screenSize
        );

        this.registerEvents();
    }

    getArrayBufferHandler() {
        return this.dataHandler;
    }
    setArrayBufferHandler(arrayBufferHandler: ArrayBufferHandler) {
        this.dataHandler = arrayBufferHandler;
    }

    registerEvents() {
        this.container.ondrop = (ev) => {
            this.dropHandler(ev);
        }
        this.container.ondragover = (ev) => {
            this.dragOverHandler(ev);
        }
    }

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

        /*
                this.loadDroppedFiles(loadedFiles).then(r => {
                    console.log("Loaded files", r);

                    for (let loadedFile of r) {

                    }
                });
        */
        this.loadDroppedFiles(loadedFiles);
    }
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
            console.log("loading las file", file, header);
            this.loadedFiles.push(file.name);
            const points = await this.lasLoader.loadLasPointsAsBuffer(file, header);
            console.log("got ", points, " points from ", file.name);
            this.dataHandler.addWithLoop(points).then(() => console.log("Added points to buffer"));
            // this.dataHandler.add(points);
            // this.loadedArrayBuffers.push(points);
            // this.isArrayBufferClaimed.push(false);
        }
    }

    hasLasEnding(fileName: string): boolean {
        for (let lasFileEnding of LAS_FILE_ENDINGS) {
            if (fileName.endsWith(lasFileEnding)) {
                return true;
            }
        }
        return false;
    }

    dragOverHandler(ev: DragEvent) {
        console.log("File(s) in drop zone");
        ev.preventDefault();
    }
}