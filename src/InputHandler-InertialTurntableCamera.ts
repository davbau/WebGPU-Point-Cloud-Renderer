import {InertialTurntableCamera} from "./InertialTurntableCamera";

export class InputHandlerInertialTurntableCamera {

    canvas: HTMLCanvasElement;
    camera: InertialTurntableCamera;

    panSpeed: number = 0.001;
    radiansPerHalfScreenWidth: number = Math.PI * 0.5;
    rotationSpeed: number = 0.001;

    /**
     * Creates an input handler for moving the camera. The camera is assumed to be an InertialTurntableCamera.
     * @param canvas The HTMLCanvas element that webGPU draws to.
     * @param camera The InertialTurntableCamera object that is used as the camera for WebGPU.
     */
    constructor(canvas: HTMLCanvasElement, camera: any) {
        this.canvas = canvas;
        this.camera = camera;
    }

    registerInputHandlers() {
        console.log("Registering input handlers");
        this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
        this.canvas.addEventListener('wheel', this.handleScroll.bind(this));
    }

    handlePointerMove(event: PointerEvent) {
        // left click to rotate camera
        if (event.buttons === 1) {
            if (event.shiftKey) {
                this.camera.pan(event.movementX * this.panSpeed, -event.movementY * this.panSpeed);
            } else if (event.metaKey) {
                this.camera.pivot(event.movementX, event.movementY);
            } else {
                this.camera.rotate(
                    -event.movementX * this.radiansPerHalfScreenWidth * this.rotationSpeed,
                    event.movementY * this.radiansPerHalfScreenWidth * this.rotationSpeed
                );
            }
        }
        event.preventDefault();
    }

    handleScroll(event: WheelEvent) {
        this.camera.zoom(0, 0, -event.deltaY / 10000);
        event.preventDefault();
    }
}