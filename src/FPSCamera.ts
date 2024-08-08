import {mat4, vec3} from 'webgpu-matrix';

export class FPSCamera {
    private position: vec3.default;
    private pitch: number;
    private yaw: number;
    private fov: number;
    private aspect: number;
    private near: number;
    private far: number;
    private viewMatrix: Float32Array;
    private projectionMatrix: Float32Array;
    private viewProjectionMatrix: Float32Array;
    private rotationSpeed: number;


    constructor(fov = 45, aspect = 1, near = 0.1, far = 100) {
        this.position = vec3.create();
        this.pitch = 0;
        this.yaw = 0;
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;
        this.viewMatrix = mat4.create();
        this.projectionMatrix = mat4.create();
        this.viewProjectionMatrix = mat4.create();
        this.updateProjectionMatrix();
        this.rotationSpeed = 0.001;
    }

    updateProjectionMatrix() {
        mat4.perspective(this.fov * (Math.PI / 180), this.aspect, this.near, this.far, this.projectionMatrix);
    }

    updateViewMatrix() {
        const front = vec3.create();
        front[0] = Math.cos(this.pitch) * Math.cos(this.yaw);
        front[1] = Math.sin(this.pitch);
        front[2] = Math.cos(this.pitch) * Math.sin(this.yaw);

        vec3.normalize(front, front);

        const right = vec3.create();
        vec3.cross(front, [0, 1, 0], right);
        vec3.normalize(right, right);

        const up = vec3.create();
        vec3.cross(right, front, up);
        vec3.normalize(up, up);

        const lookAtTarget = vec3.create();
        vec3.add(this.position, front, lookAtTarget);

        mat4.lookAt(this.position, lookAtTarget, up, this.viewMatrix);
    }

    moveForward(distance: number) {
        const front = vec3.create();
        front[0] = Math.cos(this.pitch) * Math.cos(this.yaw);
        front[1] = 0;  // No vertical movement
        front[2] = Math.cos(this.pitch) * Math.sin(this.yaw);

        vec3.normalize(front, front);
        vec3.addScaled(this.position, front, distance, this.position);
    }

    moveRight(distance: number) {
        const right = vec3.create();
        right[0] = Math.sin(this.yaw);
        right[1] = 0;  // No vertical movement
        right[2] = -Math.cos(this.yaw);

        vec3.normalize(right, right);
        vec3.addScaled(this.position, right, distance, this.position);
    }

    moveUp(distance: number) {
        this.position[1] += distance;
    }

    rotate(pitchDelta: number, yawDelta: number) {
        this.pitch += pitchDelta * this.rotationSpeed;
        this.yaw += yawDelta * this.rotationSpeed;

        this.yaw = this.mod(this.yaw, Math.PI * 2);
        this.pitch = this.clamp(this.pitch, -Math.PI / 2, Math.PI / 2);
    }

    fixedRotate(pitchDelta: number, yawDelta: number) {
        this.pitch = pitchDelta;
        this.yaw = yawDelta;

        this.yaw = this.mod(this.yaw, Math.PI * 2);
        this.pitch = this.clamp(this.pitch, -Math.PI / 2, Math.PI / 2);
    }

    getViewProjectionMatrix(): Float32Array {
        this.updateViewMatrix();
        mat4.multiply(this.projectionMatrix, mat4.invert(this.viewMatrix), this.viewProjectionMatrix);
        return this.viewProjectionMatrix;
    }

    translateCamera(x: number, y: number, z: number) {
        this.moveRight(x);
        this.moveUp(y);
        this.moveForward(z);
    }

    // https://webgpu.github.io/webgpu-samples/?sample=cameras#camera.ts
    // Returns `x` clamped between [`min` .. `max`]
    private clamp(x: number, min: number, max: number): number {
        return Math.min(Math.max(x, min), max);
    }

    // Returns `x` float-modulo `div`
    private mod(x: number, div: number): number {
        return x - Math.floor(Math.abs(x) / div) * div * Math.sign(x);
    }

}
