import {SmallLASLoader} from "./SmallLASLoader";

export class FileDropHandler {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.init();
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

        this.loadDroppedFiles(loadedFiles).then(r => {
            console.log("Loaded files", r);
        });
    }

    lasLoader = new SmallLASLoader();

    loadDroppedFiles(files: File[]): Promise<Array<ArrayBuffer>> {
        return Promise.all(files.map(async (file) => {
            if (file.name.endsWith(".las")) {
                const header = await this.lasLoader.loadLasHeader(file);
                return await this.lasLoader.loadLasPointsAsBuffer(file, header);
            } else {
                return await file.arrayBuffer();
            }
        }));
    }

    dragOverHandler(ev: DragEvent) {
        console.log("File(s) in drop zone");
        ev.preventDefault();
    }
}