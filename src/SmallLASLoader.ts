import {double, Point, u_char, u_long, u_long_long, u_short} from "./types/c_equivalents";
import LasWorker from "worker-loader!./LasLoaderWebWorker.worker.ts";

export const LAS_FILE_ENDINGS = [
    ".las",
    ".LAS"
];

export type LASHeader_small = {
    versionMajor: u_char;
    versionMinor: u_char;

    headerSize: u_short;
    offsetToPointData: u_long;
    numberOfVariableLengthRecords: u_long;

    pointDataFormatID: u_char;
    pointDataRecordLength: u_short;

    xScaleFactor: double;
    yScaleFactor: double;
    zScaleFactor: double;
    xOffset: double;
    yOffset: double;
    zOffset: double;
    maxX: double;
    minX: double;
    maxY: double;
    minY: double;
    maxZ: double;
    minZ: double;

    numberOfPointRecords: u_long_long;
    numberOfExtendedVariableLengthRecords: u_long;
}

export type LASPoint = {
    x: double;
    y: double;
    z: double;
    // We don't care about these.
    /*
    intensity: u_char;
    returnNumber: u_char;
    numberOfReturns: u_char;
    scanDirectionFlag: u_char;
    edgeOfFlightLine: u_char;
    classification: u_char;
    scanAngleRank: u_char;
    userData: u_char;
    pointSourceID: u_short;
    gpsTime: double;
     */
    red: u_short;
    green: u_short;
    blue: u_short;
}

export class SmallLASLoader {
    async loadLASHeader(file_path: string): Promise<LASHeader_small> {
        const response = await fetch(file_path);
        const buffer = await response.arrayBuffer();
        const dataView = new DataView(buffer);

        let header: LASHeader_small = {
            versionMajor: dataView.getUint8(24),
            versionMinor: dataView.getUint8(25),

            headerSize: dataView.getUint16(94, true),
            offsetToPointData: dataView.getUint32(96, true),
            numberOfVariableLengthRecords: dataView.getUint32(100, true),

            pointDataFormatID: dataView.getUint8(104),
            pointDataRecordLength: dataView.getUint16(105, true),

            xScaleFactor: dataView.getFloat64(131, true),
            yScaleFactor: dataView.getFloat64(139, true),
            zScaleFactor: dataView.getFloat64(147, true),
            xOffset: dataView.getFloat64(155, true),
            yOffset: dataView.getFloat64(163, true),
            zOffset: dataView.getFloat64(171, true),
            maxX: dataView.getFloat64(179, true),
            minX: dataView.getFloat64(187, true),
            maxY: dataView.getFloat64(195, true),
            minY: dataView.getFloat64(203, true),
            maxZ: dataView.getFloat64(211, true),
            minZ: dataView.getFloat64(219, true),

            // Set later
            numberOfPointRecords: BigInt(0),
            numberOfExtendedVariableLengthRecords: 0
        };

        if (header.versionMajor !== 1 || header.versionMinor <= 2) {
            header.numberOfPointRecords = BigInt(dataView.getUint32(107, true));
        } else {
            header.numberOfPointRecords = dataView.getBigUint64(247, true);
            header.numberOfExtendedVariableLengthRecords = dataView.getUint32(243, true);
        }

        return header;
    }

    async loadLasHeader(file: File): Promise<LASHeader_small> {
        const buffer = await file.arrayBuffer();
        const dataView = new DataView(buffer);

        let header: LASHeader_small = {
            versionMajor: dataView.getUint8(24),
            versionMinor: dataView.getUint8(25),

            headerSize: dataView.getUint16(94, true),
            offsetToPointData: dataView.getUint32(96, true),
            numberOfVariableLengthRecords: dataView.getUint32(100, true),

            pointDataFormatID: dataView.getUint8(104),
            pointDataRecordLength: dataView.getUint16(105, true),

            xScaleFactor: dataView.getFloat64(131, true),
            yScaleFactor: dataView.getFloat64(139, true),
            zScaleFactor: dataView.getFloat64(147, true),
            xOffset: dataView.getFloat64(155, true),
            yOffset: dataView.getFloat64(163, true),
            zOffset: dataView.getFloat64(171, true),
            maxX: dataView.getFloat64(179, true),
            minX: dataView.getFloat64(187, true),
            maxY: dataView.getFloat64(195, true),
            minY: dataView.getFloat64(203, true),
            maxZ: dataView.getFloat64(211, true),
            minZ: dataView.getFloat64(219, true),

            // Set later
            numberOfPointRecords: BigInt(0),
            numberOfExtendedVariableLengthRecords: 0
        };

        if (header.versionMajor !== 1 || header.versionMinor <= 2) {
            header.numberOfPointRecords = BigInt(dataView.getUint32(107, true));
        } else {
            header.numberOfPointRecords = dataView.getBigUint64(247, true);
            header.numberOfExtendedVariableLengthRecords = dataView.getUint32(243, true);
        }

        return header;
    }

    async loadLASPoints(file_path: string, header: LASHeader_small): Promise<LASPoint[]> {
        const response = await fetch(file_path);
        const buffer = await response.arrayBuffer();
        const dataView = new DataView(buffer);

        const numberOfPoints_int = Number(header.numberOfPointRecords);
        const points = new Array<LASPoint>(numberOfPoints_int);

        for (let i = 0; i < numberOfPoints_int; i++) {
            const offset = header.offsetToPointData + i * header.pointDataRecordLength;
            points[i] = {
                x: dataView.getInt32(offset + 0, true) * header.xScaleFactor + header.xOffset,
                y: dataView.getInt32(offset + 8, true) * header.yScaleFactor + header.yOffset,
                z: dataView.getInt32(offset + 16, true) * header.zScaleFactor + header.zOffset,
                red: dataView.getUint16(offset + 28, true),
                green: dataView.getUint16(offset + 30, true),
                blue: dataView.getUint16(offset + 32, true),
            };
        }

        return points;
    }

    async loadLASPointsAsBuffer(file_path: string, header: LASHeader_small, max_points: number = 1e12): Promise<ArrayBuffer> {
        const response = await fetch(file_path);
        const buffer = await response.arrayBuffer();

        return this.loadLasPointsAsBufferHelper(buffer, header, max_points);
    }

    async loadLasPointsAsBuffer(file: File, header: LASHeader_small, max_points: number = 1e12): Promise<ArrayBuffer> {
        const buffer = await file.arrayBuffer();

        return this.loadLasPointsAsBufferHelper(buffer, header, max_points);
        // return this.loadLasPointsAsBufferHelperViaWorker(buffer, header, max_points); // Promise<Promise<ArrayBuffer>> gets flattened by JavaScript automatically -> Only Promise<ArrayBuffer>.
    }

    private loadLasPointsAsBufferHelper(buffer: ArrayBuffer, header: LASHeader_small, max_points: number = 1e12) {
        const dataView = new DataView(buffer);

        const skipper = 1;

        //
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
            this.omg(header, dataView, pointView, i, skipper, rgbOffset);
        }

        console.log(`Extents found after model load: mX: ${SmallLASLoader.minX}, mY: ${SmallLASLoader.minY}, mZ: ${SmallLASLoader.minZ}, MX: ${SmallLASLoader.maxX}, MY: ${SmallLASLoader.maxY}, MZ: ${SmallLASLoader.maxZ}`);

        return pointBuffer;
    }

    static minX = Infinity;
    static minY = Infinity;
    static minZ = Infinity;
    static maxX = -Infinity;
    static maxY = -Infinity;
    static maxZ = -Infinity;

    async omg(header: LASHeader_small, dataView: DataView, pointView: DataView, i: number, skipper: number, rgbOffset: number) {
        const read_offset = header.offsetToPointData + i * header.pointDataRecordLength;
        let x = dataView.getInt32(read_offset + 0, true) * header.xScaleFactor + header.xOffset;
        let y = dataView.getInt32(read_offset + 4, true) * header.yScaleFactor + header.yOffset;
        let z = dataView.getInt32(read_offset + 8, true) * header.zScaleFactor + header.zOffset;

        let R = this.colorTo256(dataView.getUint16(read_offset + rgbOffset + 0, true));
        let G = this.colorTo256(dataView.getUint16(read_offset + rgbOffset + 2, true));
        let B = this.colorTo256(dataView.getUint16(read_offset + rgbOffset + 4, true));
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

    async loadLasPointsAsPoints(file_path: string, header: LASHeader_small, max_points: number = 1e12): Promise<Point[]> {
        const response = await fetch(file_path);
        // const buffer = await response.arrayBuffer();

        //
        let rgbOffset = 0;
        if (header.pointDataFormatID === 2) rgbOffset = 20;
        if (header.pointDataFormatID === 3) rgbOffset = 28;
        if (header.pointDataFormatID === 5) rgbOffset = 28;
        if (header.pointDataFormatID === 7) rgbOffset = 30;

        const numberOfPoints_int = Number(header.numberOfPointRecords);
        // const points = new Float32Array(numberOfPoints_int * (4));
        const points: Point[] = [];

        // const buffer = new ArrayBuffer(numberOfPoints_int * header.pointDataRecordLength);
        const buffer = await response.arrayBuffer();
        const dataView = new DataView(buffer);

        // const offset = header.offsetToPointData;
        // const handle = await fsp.open(file_path, 'r');

        // await handle.read(buffer, 0, header.headerSize, 0);

        // add points in corners
        points.push({x: 0, y: 0, z: 0, color: 0xff0000});
        points.push({x: 1, y: 0, z: 0, color: 0xff0000});
        points.push({x: 0, y: 1, z: 0, color: 0xff0000});
        points.push({x: 1, y: 1, z: 0, color: 0xff0000});

        points.push({x: 0, y: 0, z: 1, color: 0xff0000});
        points.push({x: 1, y: 0, z: 1, color: 0xff0000});
        points.push({x: 0, y: 1, z: 1, color: 0xff0000});
        points.push({x: 1, y: 1, z: 1, color: 0xff0000});

        // Currently only taking every 500th point to reduce data size during development
        for (let i = 0; i < Math.min(numberOfPoints_int, max_points); i += 500) {
            const offset = header.offsetToPointData + i * header.pointDataRecordLength;
            let X = dataView.getInt32(offset + 0, true);
            let Y = dataView.getInt32(offset + 4, true);
            let Z = dataView.getInt32(offset + 8, true);


            // let x = X * header.xScaleFactor + header.xOffset - header.minX;
            // let y = Y * header.yScaleFactor + header.yOffset - header.minY;
            // let z = Z * header.zScaleFactor + header.zOffset - header.minZ;
            let x = X * header.xScaleFactor + header.xOffset;
            let y = Y * header.yScaleFactor + header.yOffset;
            let z = Z * header.zScaleFactor + header.zOffset;

            // normalize to 0-1 box
            x = (x - header.minX) / (header.maxX - header.minX);
            y = (y - header.minY) / (header.maxY - header.minY);
            z = (z - header.minZ) / (header.maxZ - header.minZ);

            let R = dataView.getUint16(offset + rgbOffset + 0, true);
            let G = dataView.getUint16(offset + rgbOffset + 2, true);
            let B = dataView.getUint16(offset + rgbOffset + 4, true);
            let r = Math.floor(R > 255 ? R / 256 : R);
            let g = Math.floor(G > 255 ? G / 256 : G);
            let b = Math.floor(B > 255 ? B / 256 : B);

            // read into array
            const point: Point = {
                x: x,
                y: y,
                z: z,
                color: r << 16 | g << 8 | b
            };

            points.push(point);
        }
        return points;
    }

    // Your main thread

    private async loadLasPointsAsBufferHelperViaWorker(buffer: ArrayBuffer, header: LASHeader_small, max_points: number = 1e12): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./LasLoaderWebWorker.worker.ts', import.meta.url));
            // const worker = new LasWorker();

            worker.onmessage = (event) => {
                const {pointBuffer} = event.data;
                console.log("Point Buffer received from worker:", pointBuffer);
                resolve(pointBuffer);
            };

            worker.onerror = (error) => {
                console.error("Worker error:", error);
                reject(error);
            };

            // Post data to the worker
            worker.postMessage({
                buffer: buffer,
                header: header,
                max_points: max_points
            }, [buffer]);  // Transfer the buffer to avoid copying
        });
    }

    private colorTo256(color: u_short): number {
        return Math.floor(color > 255 ? color / 256 : color);
    }
}