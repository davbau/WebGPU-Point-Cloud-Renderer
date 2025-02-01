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

eval("__webpack_require__.r(__webpack_exports__);\nconst ctx = self;\nctx.onmessage = function (event) {\n    console.log(\"Worker received message: \", event.data);\n    // ctx.postMessage(1);  // Transfer the buffer to avoid copying it\n};\nctx.onerror = function (event) {\n    // Send the error message back to the main thread\n    ctx.postMessage({ error: event });\n};\nfunction colorTo256(color) {\n    return Math.floor(color > 255 ? color / 256 : color);\n}\n\n\n\n//# sourceURL=webpack://point_cloud_renderer/./src/LasLoaderWebWorker.worker.ts?");

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