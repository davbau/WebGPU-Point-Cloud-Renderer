/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/LasLoaderWebWorker.worker.ts":
/*!******************************************!*\
  !*** ./src/LasLoaderWebWorker.worker.ts ***!
  \******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\nself.onmessage = function (event) {\n    console.log(\"Worker received message: \", event.data);\n    self.postMessage(1); // Transfer the buffer to avoid copying it\n    return;\n    /*\n    const {buffer, header, max_points} = event.data;\n\n    const dataView = new DataView(buffer);\n    const skipper = 1;\n\n    let rgbOffset = 0;\n    if (header.pointDataFormatID === 2) rgbOffset = 20;\n    if (header.pointDataFormatID === 3) rgbOffset = 28;\n    if (header.pointDataFormatID === 5) rgbOffset = 28;\n    if (header.pointDataFormatID === 7) rgbOffset = 30;\n\n    console.log(\"rgbOffset according to header: \", rgbOffset);\n\n    const numberOfPoints_int = Number(header.numberOfPointRecords);\n    const pointBuffer = new ArrayBuffer(numberOfPoints_int * (16));\n    const pointView = new DataView(pointBuffer);\n\n    for (let i = 0; i < Math.min(numberOfPoints_int, max_points); i += skipper) {\n        const read_offset = header.offsetToPointData + i * header.pointDataRecordLength;\n        let x = dataView.getInt32(read_offset + 0, true) * header.xScaleFactor + header.xOffset;\n        let y = dataView.getInt32(read_offset + 4, true) * header.yScaleFactor + header.yOffset;\n        let z = dataView.getInt32(read_offset + 8, true) * header.zScaleFactor + header.zOffset;\n\n        // use max and min extent to normalize\n        // x = (x - header.minX) / (header.maxX - header.minX);\n        // y = (y - header.minY) / (header.maxY - header.minY);\n        // z = (z - header.minZ) / (header.maxZ - header.minZ);\n\n        let R = colorTo256(dataView.getUint16(read_offset + rgbOffset + 0, true));\n        let G = colorTo256(dataView.getUint16(read_offset + rgbOffset + 2, true));\n        let B = colorTo256(dataView.getUint16(read_offset + rgbOffset + 4, true));\n        let r = Math.floor(R > 255 ? R / 256 : R);\n        let g = Math.floor(G > 255 ? G / 256 : G);\n        let b = Math.floor(B > 255 ? B / 256 : B);\n\n        // write points into buffer\n        const writeOffset = (i / skipper) * 16;\n        pointView.setFloat32(writeOffset + 0, x, true);\n        pointView.setFloat32(writeOffset + 4, y, true);\n        pointView.setFloat32(writeOffset + 8, z, true);\n        pointView.setUint32(writeOffset + 12, r << 16 | g << 8 | b, true);\n\n    }\n\n    // Send the processed pointBuffer back to the main thread\n    self.postMessage({pointBuffer}, \"*\", [pointBuffer]);  // Transfer the buffer to avoid copying it\n     */\n};\nself.onerror = function (event) {\n    // Send the error message back to the main thread\n    self.postMessage({ error: event });\n};\nfunction colorTo256(color) {\n    return Math.floor(color > 255 ? color / 256 : color);\n}\n\n\n\n//# sourceURL=webpack://check_web_gpu/./src/LasLoaderWebWorker.worker.ts?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./src/LasLoaderWebWorker.worker.ts"](0, __webpack_exports__, __webpack_require__);
/******/ 	
/******/ })()
;