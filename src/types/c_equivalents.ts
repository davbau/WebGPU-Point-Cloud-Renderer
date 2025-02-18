/**
 * This file contains the equivalent types in C for the types used in the project.
 */

/** A **1 byte** character. */
export type char = number; // 1 byte
/** A **2 byte** unsigned integer. 0 to 65535. */
export type u_short = number; // 2 bytes
/** A **4 byte** unsigned integer. 0 to 4294967295. */
export type u_int32 = number; // 4 bytes
/** A **4 byte** unsigned integer. 0 to 4294967295. */
export type u_long = number; // 4 bytes
/** An **8 byte** unsigned integer. 0 to 18446744073709551615. */
export type u_long_long = bigint; // 8 bytes
/** A **1 byte** unsigned integer. 0 to 255. */
export type u_char = number; // 1 byte
/** A **8 byte** float. */
export type double = number; // 8 bytes
/** A **4 byte** float. */
export type f32 = number; // 4 bytes

/**
 * A point in 3D space with a color value.
 */
export type Point = {
    x: f32,
    y: f32,
    z: f32,
    color: u_int32,
};

/**
 * The size of a point in bytes. It is equal to 4 * 4 bytes.
 */
export const SIZE_OF_POINT = 4 * Float32Array.BYTES_PER_ELEMENT; // 4 * 4 bytes