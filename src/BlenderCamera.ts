import {mat4, vec3} from "webgpu-matrix";

export class BlenderCamera {
    rotationSpeed: number;
    movementSpeed: number;
    scrollSpeed: number;
    sphericalCoordinate: SphericalCoordinate;

    fov: number
    aspect: number;
    near: number;
    far: number;

    private matricesNeedToBeUpdated;

    private cameraMatrix: Float32Array;
    private projectionMatrix: Float32Array;
    private viewProjectionMatrix: Float32Array;

    constructor(fov: number, aspect: number, near: number, far: number) {
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;

        this.rotationSpeed = 0.05;
        this.movementSpeed = 0.01;
        this.scrollSpeed = 0.01;

        this.cameraMatrix = mat4.identity();
        this.projectionMatrix = mat4.perspective(fov, aspect, near, far);
        this.viewProjectionMatrix = mat4.identity();

        this.sphericalCoordinate = new SphericalCoordinate(20, 0, 0);
        this.sphericalCoordinate.setPhiDeg(90 + 30);
        this.sphericalCoordinate.setThetaDeg(360 - 45);

        this.matricesNeedToBeUpdated = false;
    }

    moveCameraBase(vec: vec3.default) {
        this.sphericalCoordinate.moveCenter(vec);
        this.matricesNeedToBeUpdated = true;
    }

    moveCameraBaseScaled(vec: vec3.default) {
        this.sphericalCoordinate.moveCenter(vec3.scale(vec, this.movementSpeed));
        this.matricesNeedToBeUpdated = true;
    }

    moveCameraAlongViewDirectionScaled(vec: vec3.default) {
        const translation = vec3.create();
        mat4.getTranslation(mat4.translate(this.cameraMatrix, vec), translation);
        this.sphericalCoordinate.moveCenter(vec3.scale(translation, this.movementSpeed));
        this.matricesNeedToBeUpdated = true;
    }

    rotateUpDown(angle: number) {
        this.sphericalCoordinate.rotateUpDown(angle * this.rotationSpeed);
        this.matricesNeedToBeUpdated = true;
    }

    rotateLeftRight(angle: number) {
        this.sphericalCoordinate.rotateLeftRight(angle * this.rotationSpeed);
        this.matricesNeedToBeUpdated = true;
    }

    zoomInOut(deltaY: number) {
        this.sphericalCoordinate.radius += deltaY * this.scrollSpeed;
        if (this.sphericalCoordinate.radius < 0.1) this.sphericalCoordinate.radius = 0.1;
        this.matricesNeedToBeUpdated = true;
    }

    getViewMatrix() {
        return mat4.inverse(this.cameraMatrix);
    }

    calculateCameraMatrix() {
        const position = this.sphericalCoordinate.getPositionInWorld();
        const center = this.sphericalCoordinate.getCenterInWorld();
        const up = this.sphericalCoordinate.getUpVector();
        mat4.lookAt(position, center, up, this.cameraMatrix);
    }

    calculateViewProjectionMatrix() {
        this.calculateCameraMatrix();
        mat4.multiply(this.projectionMatrix, mat4.inverse(this.cameraMatrix), this.viewProjectionMatrix);
    }

    getViewProjectionMatrix() {
        this.calculateViewProjectionMatrix();
        return this.viewProjectionMatrix;
    }
}

class SphericalCoordinate {
    centerInWorld: vec3.default;
    phi: number;
    theta: number;
    radius: number;

    constructor(radius: number, phi: number, theta: number) {
        this.centerInWorld = vec3.create();
        this.phi = phi;
        this.theta = theta;
        this.radius = radius;
    }

    getPositionInWorld() {
        const positionInWorld = vec3.create();
        positionInWorld[0] = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
        positionInWorld[1] = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
        positionInWorld[2] = this.radius * Math.cos(this.phi);
        return positionInWorld;
    }

    getCenterInWorld() {
        return this.centerInWorld;
    }

    getUpVector() {
        const up = vec3.create(
            Math.cos(this.phi) * Math.cos(this.theta),
            Math.cos(this.phi) * Math.sin(this.theta),
            -Math.sin(this.phi)
        );
        return up;
    }

    moveCenter(vec: vec3.default) {
        vec3.add(this.centerInWorld, vec, this.centerInWorld);
    }

    rotateUpDown(angle: number) {
        this.phi += this.degToRad(angle);
        this.assertPhiRange();
    }

    rotateLeftRight(angle: number) {
        this.theta += this.degToRad(angle);
        this.assertThetaRange()
    }

    setPhiDeg(phi: number) {
        this.phi = this.degToRad(phi);
        this.assertPhiRange();
    }

    setThetaDeg(theta: number) {
        this.theta = this.degToRad(theta);
        this.assertThetaRange();
    }

    assertPhiRange() {
        if (this.phi < 0) this.phi = 0;
        if (this.phi > Math.PI) this.phi = Math.PI;
    }

    assertThetaRange() {
        this.theta = this.theta % (Math.PI * 2);
    }

    degToRad(deg: number): number {
        return deg * Math.PI / 180;
    }
}