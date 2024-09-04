import {LAS_FILE_ENDINGS, SmallLASLoader} from "./SmallLASLoader";
import {ArrayBufferHandler} from "./ArrayBufferHandler";

export class FileDropHandler {
    private container: HTMLElement;
    private loadedFiles: string[];
    private loadedArrayBuffers: ArrayBuffer[];
    // private isArrayBufferClaimed: boolean[];

    private arrayBufferHandler: ArrayBufferHandler;

    constructor(container: HTMLElement, maxBufferSize: number) {
        this.container = container;

        this.loadedFiles = [];
        this.loadedArrayBuffers = [];
        // this.isArrayBufferClaimed = [];

        this.arrayBufferHandler = new ArrayBufferHandler(maxBufferSize);

        this.init();
    }

    getArrayBufferHandler() {
        return this.arrayBufferHandler;
    }
    setArrayBufferHandler(arrayBufferHandler: ArrayBufferHandler) {
        this.arrayBufferHandler = arrayBufferHandler;
    }

    init() {
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

    claimFileArrayBuffers(number_of_points: number) {
        if (this.loadedArrayBuffers.length === 0) {
            // console.log("No array buffers loaded");
            return;
        }
        let number_of_bytes = number_of_points * 4 * Float32Array.BYTES_PER_ELEMENT;
        while (number_of_bytes > 0 && this.loadedArrayBuffers.length > 0) {
            const buffer = this.loadedArrayBuffers.pop()!; // Can force this because we checked the length before.
            if (buffer.byteLength > number_of_bytes) {
                // add buffer to handler
                const slice = buffer.slice(0, number_of_bytes);
                this.arrayBufferHandler.add(slice);
                // add the rest back to the loadedArrayBuffers
                this.loadedArrayBuffers.push(buffer.slice(number_of_bytes));
                number_of_points -= slice.byteLength;
            } else {
                this.arrayBufferHandler.add(buffer);
                number_of_points -= buffer.byteLength;
            }
        }
    }

    private lasLoader = new SmallLASLoader();

    /*
    loadDroppedFiles(files: File[]): Promise<Awaited<null | ArrayBuffer>[]> {
        return Promise.all(files.map(async (file) => {
            if (this.loadedFiles.includes(file.name)) {
                console.log("Already loaded file", file.name);
                return null;
            }
            if (file.name.endsWith(".las")) {
                const header = await this.lasLoader.loadLasHeader(file);
                console.log("loading las file", file, header);
                this.loadedFiles.push(file.name);
                return await this.lasLoader.loadLasPointsAsBuffer(file, header);
            } else {
                return null;
            }
        }));
    }
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
            console.log("loading las file", file, header);
            this.loadedFiles.push(file.name);
            const points = await this.lasLoader.loadLasPointsAsBuffer(file, header);
            console.log("got ", points, " points from ", file.name);
            this.arrayBufferHandler.addWithLoop(points).then(() => console.log("Added points to buffer"));
            // this.arrayBufferHandler.add(points);
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