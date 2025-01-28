import {mat4, vec3} from "webgpu-matrix";

export class InertialTurntableCamera {
    fov: number;
    aspect: number;
    near: number;
    far: number;

    private camera: any; // No type information available for InertialTurntableCamera

    // private cameraMatrix: Float32Array;
    // private projectionMatrix: Float32Array;
    // private viewProjectionMatrix: Float32Array;

    private initialParams: any

    // same as BlenderCamera
    constructor(fov: number, aspect: number, near: number, far: number) {
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;

        // this.cameraMatrix = mat4.identity();
        // this.projectionMatrix = mat4.perspective(fov, aspect, near, far);
        // this.projectionMatrix = mat4.identity();
        // this.viewProjectionMatrix = mat4.identity();

        this.camera = require('inertial-turntable-camera')();

        this.initialParams = {
            center: vec3.create(0, 0, 0),
            phi: 0,
            theta: 0,
            distance: 10,
            rotateAboutCenter: true,
            fovY: fov,
            aspectRatio: aspect,
            near: near,
            far: far,
        }
        this.tick(this.initialParams);
    }

    reset() {
        this.tick(this.initialParams);
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

    resize(aspectRatio: number) {
        this.camera.resize(aspectRatio);
    }

    public getParams() {
        return this.camera.params;
    }

    public getProjectionMatrix(): Float32Array {
        return this.camera.state.projection;
    }

    public getViewMatrix(): Float32Array {
        return this.camera.state.view;
    }
}