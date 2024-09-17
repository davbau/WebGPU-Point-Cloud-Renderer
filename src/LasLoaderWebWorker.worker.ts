import {LASHeader_small} from "./SmallLASLoader";
import {u_short} from "./types/c_equivalents";

export interface WorkerMessage {
    buffer: ArrayBuffer;
    header: LASHeader_small;
    max_points: number;
}

export interface WorkerResponse {
    pointBuffer?: ArrayBuffer;
    error?: string;
}

self.onmessage = function (event: MessageEvent<WorkerMessage>) {
    console.log("Worker received message: ", event.data);
    self.postMessage(1);  // Transfer the buffer to avoid copying it
    return;

    /*
    const {buffer, header, max_points} = event.data;

    const dataView = new DataView(buffer);
    const skipper = 1;

    let rgbOffset = 0;
    if (header.pointDataFormatID === 2) rgbOffset = 20;
    if (header.pointDataFormatID === 3) rgbOffset = 28;
    if (header.pointDataFormatID === 5) rgbOffset = 28;
    if (header.pointDataFormatID === 7) rgbOffset = 30;

    console.log("rgbOffset according to header: ", rgbOffset);

    const numberOfPoints_int = Number(header.numberOfPointRecords);
    const pointBuffer = new ArrayBuffer(numberOfPoints_int * (16));
    const pointView = new DataView(pointBuffer);

    for (let i = 0; i < Math.min(numberOfPoints_int, max_points); i += skipper) {
        const read_offset = header.offsetToPointData + i * header.pointDataRecordLength;
        let x = dataView.getInt32(read_offset + 0, true) * header.xScaleFactor + header.xOffset;
        let y = dataView.getInt32(read_offset + 4, true) * header.yScaleFactor + header.yOffset;
        let z = dataView.getInt32(read_offset + 8, true) * header.zScaleFactor + header.zOffset;

        // use max and min extent to normalize
        // x = (x - header.minX) / (header.maxX - header.minX);
        // y = (y - header.minY) / (header.maxY - header.minY);
        // z = (z - header.minZ) / (header.maxZ - header.minZ);

        let R = colorTo256(dataView.getUint16(read_offset + rgbOffset + 0, true));
        let G = colorTo256(dataView.getUint16(read_offset + rgbOffset + 2, true));
        let B = colorTo256(dataView.getUint16(read_offset + rgbOffset + 4, true));
        let r = Math.floor(R > 255 ? R / 256 : R);
        let g = Math.floor(G > 255 ? G / 256 : G);
        let b = Math.floor(B > 255 ? B / 256 : B);

        // write points into buffer
        const writeOffset = (i / skipper) * 16;
        pointView.setFloat32(writeOffset + 0, x, true);
        pointView.setFloat32(writeOffset + 4, y, true);
        pointView.setFloat32(writeOffset + 8, z, true);
        pointView.setUint32(writeOffset + 12, r << 16 | g << 8 | b, true);

    }

    // Send the processed pointBuffer back to the main thread
    self.postMessage({pointBuffer}, "*", [pointBuffer]);  // Transfer the buffer to avoid copying it
     */
};

self.onerror = function (event) {
    // Send the error message back to the main thread
    self.postMessage({ error: event });
}

function colorTo256(color: u_short): number {
    return Math.floor(color > 255 ? color / 256 : color);
}