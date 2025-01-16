import {mat4} from "webgpu-matrix";

export class InertialTurntableCamera {
    fov: number;
    aspect: number;
    near: number;
    far: number;

    private camera: any; // No type information available for InertialTurntableCamera

    private cameraMatrix: Float32Array;
    private projectionMatrix: Float32Array;
    private viewProjectionMatrix: Float32Array;


    // same as BlenderCamera
    constructor(fov: number, aspect: number, near: number, far: number) {
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;

        this.cameraMatrix = mat4.identity();
        this.projectionMatrix = mat4.perspective(fov, aspect, near, far);
        this.viewProjectionMatrix = mat4.identity();

        this.camera = require('inertial-turntable-camera')({
            phi: 0.5,
            theta: 1,
            distance: 20,
        });
    }

    public pan(x: number, y: number) {
        this.camera.pan(x, y);
    }

    public pivot(x: number, y: number) {
        this.camera.pivot(x, y);
    }

    public rotate(x: number, y: number) {
        this.camera.rotate(x, y);
    }

    public zoom(x: number, y: number, z: number) {
        this.camera.zoom(x, y, z);
    }

    /**
     * Updates the camera matrices.
     * Passed parameters are used to update the camera matrices.
     * @param params Parameters to update the camera matrices.
     */
    tick(params?: any): void {
        this.camera.tick(params);
    }

    public getProjectionMatrix(): Float32Array {
        return this.camera.state.projection;
    }

    public getViewMatrix(): Float32Array {
        return this.camera.state.view;
    }
}