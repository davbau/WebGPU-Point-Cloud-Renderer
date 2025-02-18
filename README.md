# WebGPU Point Cloud Renderer
> This project was done as part of a bachelors course for the course "Computer Graphics" at the Technical University of Vienna. 

This project implements a LAS file point cloud renderer using WebGPU and compute shaders. The project uses TypeScript and Webpack to compile the project.

For good examples to learn WebGPU, check out https://webgpu.github.io/webgpu-samples/.
For a more indepth look into WebGPU, have a look at https://webgpufundamentals.org/.
I found these two resources very helpful when working on this project.


## Usage
The entire website is a canvas element. You can drag and drop the LAS or LAZ files you want to load onto the canvas. The point cloud will then be loaded.
This might take some time. The same filename can not be loaded twice.

The top left has a status element showing the current fps. A left click can change it to show GPU timing and GPU memory consumption.

The top right has some controls. 
- **renderQuality:** This effects the level of detail of the rendered points. For more information on how this works, see the algorithm section.
- **show_debug_div:** When enabled, a div will be shown in the bottom right corner with some debug information like the number of batches, loaded points, running worker threads, 
and camera information like the view and mvp matrix.
- **view_to_model:** this button centers the camera on the loaded point cloud. 

### Controls
The camera in use is the [inertial turntable camera](https://www.npmjs.com/package/inertial-turntable-camera). 
I wrote my own wrapper for TypeScript in [src/cameras/InertialTurntableCamera.ts](src/cameras/InertialTurntableCamera.ts). 
The corresponding input handler is in [src/cameras/InputHandler-InertialTurntableCamera.ts](src/cameras/InputHandler-InertialTurntableCamera.ts).

The controls are as follows:
- left drag to rotate the camera around the point cloud.
- shift + left drag to pan the camera.
- scroll to zoom in and out.

## Algorithm
The straight forward way of rendering point clouds would be to pack the x,y,z and color values into a large buffer and render them as points.
This project does things slightly differently using an LOD like approach.

Every n (per default 2 ^ 20  so ~1M) points are packed into one batch. This batch has a bounding box. Every point in the batch is then transformed as follows:
1. The point is transformed into the batch's local coordinate system.
2. Calculate the points distance from the origin to the maximum extent of the bounding box in x, y, and z direction and encode this in 30 bits.
    0 would be the origin and 30 ones would be the maximum extent of the bounding box. 
3. Split x,y,z into 3 10-bit chunks each and then stack them as follows:
   1. The first 10 bits of x, y, and z into the **course** buffer as a u32.
   2. The second 10 bits of x, y, and z into the **medium** buffer as a u32.
   3. The last 10 bits of x, y, and z into the **fine** buffer as a u32.
4. The values are unpacked in the shaders using the uniform buffer provided bounding box origin and extent.

The uniform buffer also holds a variable defining the level.

## Code Organization
The code this project is in [src](src) and split into the following sub-folders:
- [src/cameras](src/cameras): Contains the camera classes and their input handlers. Every camera class has a corresponding input handler that takes canvas events and tells the camera class what to do with them.
- [src/dataHandling](src/dataHandling): Contains classes for loading and handling the point cloud data.
- [src/shaders](src/shaders): Contains the shaders used in the project.
- [src/types](src/types): Contains some classes needed for TypeScript. There is also a file [src/types/c_equivalents.ts](src/types/c_equivalents.ts) with some C-like types to make working and thinking about buffers and the LAS standard easier.
- [src/utils](src/utils): Contains utility functions like creating pipelines, bindgroups and buffers.
- [src/main.ts](src/main.ts): The main file that sets up the renderer and starts the render loop.

## How to run
This project uses Node, Typescript and Webpack. To run the project, you need to have Node installed.
The website is hosted on [localhost port 9090](http://localhost:9090).

### Install dependencies
```bash
npm install
```

### Build and host the website
```bash
npm start
```

### Host website without compiling
If you don't want to compile the project, you can also run the website directly using the following command:
```bash
npm run serve
```

### Compile the Website without hosting it
To compile the website, run the following command:
```bash
npm run build
```

## License
This project is licensed under the MIT License. 