export class InputHandlerInertialTurntableCamera {

    canvas: HTMLCanvasElement;
    camera: any;

    panSpeed: number = 0.001;
    radiansPerHalfScreenWidth: number = Math.PI * 0.5;
    rotationSpeed: number = 0.001;

    constructor(canvas: HTMLCanvasElement, camera: any) {
        this.canvas = canvas;
        this.camera = camera;
    }

    registerInputHandlers() {
        // this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
        // this.canvas.addEventListener('wheel', this.handleScroll.bind(this));
        /*
        interactionEvents(regl._gl.canvas)
    .on('wheel', function (ev) {
      camera.zoom(ev.x, ev.y, Math.exp(-ev.dy) - 1.0);
      ev.originalEvent.preventDefault();
    })
    .on('mousemove', function (ev) {
      if (!ev.active || ev.buttons !== 1) return;

      if (ev.mods.shift) {
        camera.pan(ev.dx, ev.dy);
      } else if (ev.mods.meta) {
        camera.pivot(ev.dx, ev.dy);
      } else {
        camera.rotate(
          -ev.dx * radiansPerHalfScreenWidth,
          -ev.dy * radiansPerHalfScreenWidth
        );
      }
      ev.originalEvent.preventDefault();
    })
    .on('touchmove', function (ev) {
      if (!ev.active) return;
      camera.rotate(
        -ev.dx * radiansPerHalfScreenWidth,
        -ev.dy * radiansPerHalfScreenWidth
      );
      ev.originalEvent.preventDefault();
    })
    .on('pinchmove', function (ev) {
      if (!ev.active) return;
      camera.zoom(ev.x, ev.y, 1 - ev.zoomx);
      camera.pan(ev.dx, ev.dy);
    })
    .on('touchstart', ev => ev.originalEvent.preventDefault())
    .on('pinchstart', ev => ev.originalEvent.preventDefault())
        */

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
                    -event.movementY * this.radiansPerHalfScreenWidth * this.rotationSpeed
                );
            }
        }
        event.preventDefault();
    }

    handleScroll(event: WheelEvent) {
        this.camera.zoom(event.x, event.y, Math.exp(-event.deltaY) - 1.0);
        event.preventDefault();
    }
}