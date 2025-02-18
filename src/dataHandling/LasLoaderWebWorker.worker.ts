import {LASHeader_small} from "./SmallLASLoader";
import {u_short} from "../types/c_equivalents";

export interface WorkerMessage {
    buffer: ArrayBuffer;
    header: LASHeader_small;
    max_points: number;
}

export interface WorkerResponse {
    pointBuffer?: ArrayBuffer;
    error?: string;
}

const ctx: Worker = self as any;

ctx.onmessage = function (event: MessageEvent<WorkerMessage>) {
    console.log("Worker received message: ", event.data);
    // ctx.postMessage(1);  // Transfer the buffer to avoid copying it

};

ctx.onerror = function (event) {
    // Send the error message back to the main thread
    ctx.postMessage({ error: event });
}

function colorTo256(color: u_short): number {
    return Math.floor(color > 255 ? color / 256 : color);
}