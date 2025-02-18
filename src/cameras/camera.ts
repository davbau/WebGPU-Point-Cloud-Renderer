import {mat4, vec3} from 'webgpu-matrix';

class Camera {
    private perspectiveMatrix: Float32Array;
    private viewMatrix: Float32Array;
    private position: vec3.default;
    private rotation_speed: number;

    // private up: vec3.default;

    constructor(fovY: number, aspect: number, near: number, far: number) {
        this.perspectiveMatrix = mat4.create();
        this.viewMatrix = mat4.identity();
        // this.up = vec3.fromValues(0, 1, 0);
        mat4.perspective(fovY, aspect, near, far, this.perspectiveMatrix);
        this.position = vec3.create();
        this.rotation_speed = 0.05;
    }

    // move camera
    public translateCamera(x: number, y: number, z: number): void {
        this.position = vec3.add(this.position, vec3.fromValues(x, y, z));
        mat4.translate(this.viewMatrix, vec3.fromValues(x, y, z), this.viewMatrix);
    }

    // rotate camera around origin
    public rotateCamera(x: number, y: number, z: number, angle_deg: number): void {
        mat4.rotate(this.viewMatrix, vec3.fromValues(x, y, z), this.degToRad(angle_deg) * this.rotation_speed, this.viewMatrix);
    }

    // rotate camera itself to change looking direction
    public rotateCameraSelf(x: number, y: number, z: number, angle_deg: number): void {
        // center the camera
        mat4.translate(this.viewMatrix, vec3.fromValues(-this.position[0], -this.position[1], -this.position[2]), this.viewMatrix);
        // rotate the camera
        mat4.rotate(this.viewMatrix, vec3.fromValues(x, y, z), this.degToRad(angle_deg) * this.rotation_speed, this.viewMatrix);
        // move the camera back
        mat4.translate(this.viewMatrix, this.position, this.viewMatrix);
    }


    // get view-projection matrix
    public getViewProjectionMatrix(): Float32Array {
        const viewProjectionMatrix = mat4.create();
        mat4.multiply(this.perspectiveMatrix, this.viewMatrix, viewProjectionMatrix);
        return viewProjectionMatrix;
    }


    private radToDeg(rad: number): number {
        return rad * 180 / Math.PI;
    }

    private degToRad(deg: number): number {
        return deg * Math.PI / 180;
    }
}

export default Camera;