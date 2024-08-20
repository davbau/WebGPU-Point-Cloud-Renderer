export type char = number; // 1 byte
export type u_short = number; // 2 bytes
export type u_int = number; // 4 bytes
export type u_long = number; // 4 bytes
export type u_long_long = bigint; // 8 bytes
export type u_char = number; // 1 byte
export type double = number; // 8 bytes

export type f32 = number; // 4 bytes
export type u_int32 = number; // 4 bytes
export type Point = {
    x: f32,
    y: f32,
    z: f32,
    color: u_int32,
};

export const SIZE_OF_POINT = 4 * Float32Array.BYTES_PER_ELEMENT; // 4 * 4 bytes