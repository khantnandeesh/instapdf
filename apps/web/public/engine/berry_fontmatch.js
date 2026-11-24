/* @ts-self-types="./berry_fontmatch.d.ts" */

/**
 * Distance of two coarse vectors, 0 to 1, or -1 when they share too little to compare.
 * @param {Uint8Array | number[]} a
 * @param {Uint8Array | number[]} b
 * @returns {number}
 */
export function coarseDistance(a, b) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArray8ToWasm0(a, wasm.__wbindgen_export3);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(b, wasm.__wbindgen_export3);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_export4(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_export4(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.coarseDistance(ptr0, len0, ptr1, len1);
    return ret;
}

/**
 * Compares two fonts glyph by glyph (the `glyphs` bytes of two fingerprints) and grades the
 * match: [glyph distance or -1 when they share no character, characters compared, grade], with
 * grade 0 = exact, 1 = very close, 2 = close, 3 = loose.
 * @param {Uint8Array | number[]} a
 * @param {Uint8Array | number[]} b
 * @param {number} coarse_distance
 * @returns {Float32Array}
 */
export function compare(a, b, coarse_distance) {
    const val3 = +coarse_distance;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArray8ToWasm0(a, wasm.__wbindgen_export3);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(b, wasm.__wbindgen_export3);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_export4(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_export4(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.compare(ptr0, len0, ptr1, len1, val3);
    return ret;
}

/**
 * Fingerprint of a TrueType or OpenType file. `chars` adds characters beyond the Latin
 * letters and digits (e.g. a script's letters). Null when the bytes are not a font.
 * @param {Uint8Array | number[]} bytes
 * @param {string | null} [chars]
 * @returns {any}
 */
export function fingerprintFile(bytes, chars) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export3);
        len0 = WASM_VECTOR_LEN;
        ptr1 = isLikeNone(chars) ? 0 : passStringToWasm0(chars, wasm.__wbindgen_export3, wasm.__wbindgen_export5);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_export4(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_export4(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.fingerprintFile(ptr0, len0, ptr1, len1);
    return ret;
}

/**
 * Fingerprint of a font program embedded in a PDF, from the engine's fontProgram(): the three
 * arrays are parallel (character, glyph index, advance in 1/1000 em). Falls back to the widths
 * alone when the program cannot be read.
 * @param {string} format
 * @param {Uint8Array | number[]} bytes
 * @param {Uint32Array | number[]} cps
 * @param {Uint16Array | number[]} gids
 * @param {Float32Array | number[]} widths
 * @returns {any}
 */
export function fingerprintProgram(format, bytes, cps, gids, widths) {
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4;
    try {
        ptr0 = passStringToWasm0(format, wasm.__wbindgen_export3, wasm.__wbindgen_export5);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_export3);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray32ToWasm0(cps, wasm.__wbindgen_export3);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray16ToWasm0(gids, wasm.__wbindgen_export3);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArrayF32ToWasm0(widths, wasm.__wbindgen_export3);
        len4 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr4) { wasm.__wbindgen_export4(ptr4, len4 * 4, 4); }
        if (ptr3) { wasm.__wbindgen_export4(ptr3, len3 * 2, 2); }
        if (ptr2) { wasm.__wbindgen_export4(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_export4(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_export4(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.fingerprintProgram(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
    return ret;
}

/**
 * The `top` faces of an index closest to `coarse`, best first, as [face, distance, face,
 * distance…]. `allow`, when given, has one byte a face: 0 leaves the face out.
 * @param {Uint8Array | number[]} coarse
 * @param {Uint8Array | number[]} index
 * @param {number} top
 * @param {Uint8Array | number[] | null} [allow]
 * @returns {Float32Array}
 */
export function rank(coarse, index, top, allow) {
    const val4 = +top;
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passArray8ToWasm0(coarse, wasm.__wbindgen_export3);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(index, wasm.__wbindgen_export3);
        len1 = WASM_VECTOR_LEN;
        ptr2 = isLikeNone(allow) ? 0 : passArray8ToWasm0(allow, wasm.__wbindgen_export3);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_export4(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_export4(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_export4(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.rank(ptr0, len0, ptr1, len1, val4, ptr2, len2);
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_new_cd4348290afae586: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_from_slice_355c10c5d8f2addb: function(arg0, arg1) {
            const ret = new Float32Array(getArrayF32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_b8daf545a41c6aa0: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_set_2793479888329cb6: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbindgen_generic_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./berry_fontmatch_bg.js": import0,
    };
}

function addToExternrefTable0(obj) {
    const idx = wasm.__wbindgen_export2();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_export(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray16ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 2, 2) >>> 0;
    getUint16ArrayMemory0().set(arg, ptr / 2);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('berry_fontmatch_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
