import {BlenderCamera} from "./BlenderCamera";

export class InputHandler {
    canvas: HTMLCanvasElement;
    leftHeld = false;
    rightHeld = false;
    middleHeld = false;

    camera: BlenderCamera;

    constructor(canvas: HTMLCanvasElement, camera: BlenderCamera) {
        this.canvas = canvas;
        this.camera = camera;
    }

    registerInputHandlers() {
        this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
        this.canvas.addEventListener('wheel', this.handleScroll.bind(this));
    }

    handlePointerMove(event: PointerEvent) {
        // left click to rotate camera
        if (event.buttons === 1) {
            this.camera.rotateLeftRight(event.movementX);
            this.camera.rotateUpDown(event.movementY);
        }

        // middle click to move camera
        if (event.buttons === 4) {
            this.camera.moveCameraAlongViewDirectionScaled([event.movementX, -event.movementY, 0]);
        }
    }

    handleScroll(event: WheelEvent) {
        this.camera.zoomInOut(event.deltaY);
    }
}