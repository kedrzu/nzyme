/**
 * Where a single entry of the runtime model comes from. Every entry carries one, because the three
 * sources are trusted for different reasons and go stale in different ways.
 */
export type CloudFrontRuntimeProvenance =
    /** Listed in the AWS runtime 2.0 feature document (see {@link CloudFrontRuntime.docUrl}). */
    | 'doc'
    /**
     * Measured with `aws cloudfront test-function` against the deployed runtime on 2026-09-04.
     * The runtime has it, the document omits it.
     */
    | 'probe'
    /**
     * Referenced by a `@babel/core` 8 helper emitted for syntax we downlevel. On the list by
     * construction: without it every function we ship today would be rejected.
     */
    | 'helper';

/**
 * A closed model of what the `cloudfront-js-2.0` runtime offers. The runtime is an explicit
 * allowlist, not a JS engine with a version number, so a target like `node: '5'` cannot express it:
 * it downlevels syntax the runtime already has and stays silent about built-in methods the runtime
 * lacks. This model is the source of truth for both halves — which syntax the Babel preset may keep,
 * and which identifiers/methods the final-bundle check accepts.
 */
export interface CloudFrontRuntime {
    /** AWS document this model was transcribed from. */
    docUrl: string;
    /** Date the document was read. Re-read it before widening anything here. */
    docReadOn: string;
    /** Hard, non-adjustable per-function size limit. */
    maxFunctionBytes: number;
    /**
     * Identifiers a bundle may reference without a binding in scope. Anything else — `Map`, `Set`,
     * `Proxy`, `Reflect`, `Intl`, `URL`, `structuredClone`, `eval`, `setTimeout`, `process`,
     * `require` — is absent from the runtime and is rejected by simply not being listed.
     * `Reflect` is left out deliberately: Babel's `class extends` helper needs `Reflect.construct`,
     * so `class extends` in edge code must fail the check rather than fail at the edge.
     */
    globals: Readonly<Record<string, CloudFrontRuntimeProvenance>>;
    /**
     * Static members per global. A call `Global.member(...)` where `Global` is listed here and
     * `member` is not is rejected — this is what catches `Object.fromEntries`, `Object.hasOwn`,
     * `Object.groupBy`, `String.raw` and friends.
     */
    statics: Readonly<Record<string, Readonly<Record<string, CloudFrontRuntimeProvenance>>>>;
    /**
     * Instance methods the runtime does not have, mapped to the replacement to suggest. Receiver
     * types are unknown after minification, so this half is a denylist: a call `x.toSorted(...)` is
     * rejected whatever `x` is. A user method colliding with one of these names is a deliberate
     * false alarm — renaming it is cheaper than an escape hatch.
     */
    missingMethods: Readonly<Record<string, string>>;
    /** Modules loadable with `require(...)`; the only legal use of a free `require` identifier. */
    modules: readonly string[];
}

const MATH_MEMBERS: Record<string, CloudFrontRuntimeProvenance> = {
    E: 'doc',
    LN10: 'doc',
    LN2: 'doc',
    LOG10E: 'doc',
    LOG2E: 'doc',
    PI: 'doc',
    SQRT1_2: 'doc',
    SQRT2: 'doc',
    abs: 'doc',
    acos: 'doc',
    acosh: 'doc',
    asin: 'doc',
    asinh: 'doc',
    atan: 'doc',
    atan2: 'doc',
    atanh: 'doc',
    cbrt: 'doc',
    ceil: 'doc',
    clz32: 'doc',
    cos: 'doc',
    cosh: 'doc',
    exp: 'doc',
    expm1: 'doc',
    floor: 'doc',
    fround: 'doc',
    hypot: 'doc',
    imul: 'doc',
    log: 'doc',
    log1p: 'doc',
    log2: 'doc',
    log10: 'doc',
    max: 'doc',
    min: 'doc',
    pow: 'doc',
    random: 'doc',
    round: 'doc',
    sign: 'doc',
    sin: 'doc',
    sinh: 'doc',
    sqrt: 'doc',
    tan: 'doc',
    tanh: 'doc',
    trunc: 'doc',
};

const TYPED_ARRAY_STATICS: Record<string, CloudFrontRuntimeProvenance> = {
    from: 'doc',
    of: 'doc',
};

const TYPED_ARRAYS = [
    'Float32Array',
    'Float64Array',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Uint16Array',
    'Uint32Array',
] as const;

/**
 * The `cloudfront-js-2.0` runtime model. See {@link CloudFrontRuntime} for why it exists.
 */
export const cloudFrontRuntime: CloudFrontRuntime = {
    docUrl: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html',
    docReadOn: '2026-09-04',
    maxFunctionBytes: 10_240,
    globals: {
        // Globals and global functions, "Globals" section of the document.
        globalThis: 'doc',
        NaN: 'doc',
        Infinity: 'doc',
        undefined: 'doc',
        arguments: 'doc',
        decodeURI: 'doc',
        decodeURIComponent: 'doc',
        encodeURI: 'doc',
        encodeURIComponent: 'doc',
        isFinite: 'doc',
        isNaN: 'doc',
        parseFloat: 'doc',
        parseInt: 'doc',
        atob: 'doc',
        btoa: 'doc',
        // Every deployed function starts with `global.handler = ...` and runs, but the document
        // only mentions `globalThis`.
        global: 'probe',
        // Primitive and built-in objects.
        Object: 'doc',
        String: 'doc',
        Number: 'doc',
        Boolean: 'doc',
        Array: 'doc',
        Math: 'doc',
        Date: 'doc',
        Function: 'doc',
        RegExp: 'doc',
        JSON: 'doc',
        Symbol: 'doc',
        Promise: 'doc',
        ArrayBuffer: 'doc',
        DataView: 'doc',
        TextEncoder: 'doc',
        TextDecoder: 'doc',
        console: 'doc',
        Float32Array: 'doc',
        Float64Array: 'doc',
        Int8Array: 'doc',
        Int16Array: 'doc',
        Int32Array: 'doc',
        Uint8Array: 'doc',
        Uint8ClampedArray: 'doc',
        Uint16Array: 'doc',
        Uint32Array: 'doc',
        // Error types.
        Error: 'doc',
        EvalError: 'doc',
        InternalError: 'doc',
        RangeError: 'doc',
        ReferenceError: 'doc',
        SyntaxError: 'doc',
        TypeError: 'doc',
        URIError: 'doc',
    },
    statics: {
        Object: {
            create: 'doc',
            defineProperties: 'doc',
            defineProperty: 'doc',
            freeze: 'doc',
            getOwnPropertyDescriptor: 'doc',
            getOwnPropertyDescriptors: 'doc',
            getOwnPropertyNames: 'doc',
            getPrototypeOf: 'doc',
            isExtensible: 'doc',
            isFrozen: 'doc',
            isSealed: 'doc',
            keys: 'doc',
            preventExtensions: 'doc',
            seal: 'doc',
            assign: 'doc',
            entries: 'doc',
            values: 'doc',
            // The document lists these as `Object.prototype.is()` / `Object.prototype.setPrototypeOf()`,
            // which is where they actually live on `Object` itself.
            is: 'doc',
            setPrototypeOf: 'doc',
            // Emitted by Babel's object-rest helper.
            getOwnPropertySymbols: 'helper',
        },
        String: {
            fromCharCode: 'doc',
            fromCodePoint: 'doc',
        },
        Number: {
            EPSILON: 'doc',
            MAX_SAFE_INTEGER: 'doc',
            MIN_SAFE_INTEGER: 'doc',
            MAX_VALUE: 'doc',
            MIN_VALUE: 'doc',
            NaN: 'doc',
            NEGATIVE_INFINITY: 'doc',
            POSITIVE_INFINITY: 'doc',
            isFinite: 'doc',
            isInteger: 'doc',
            isNaN: 'doc',
            isSafeInteger: 'doc',
            parseInt: 'doc',
            parseFloat: 'doc',
        },
        Math: MATH_MEMBERS,
        JSON: {
            parse: 'doc',
            stringify: 'doc',
        },
        Array: {
            isArray: 'doc',
            of: 'doc',
            // The document lists only `isArray`/`of`, but the deployed runtime has `from` — and
            // Babel's iterable helpers call it.
            from: 'probe',
        },
        ArrayBuffer: {
            isView: 'doc',
        },
        Promise: {
            all: 'doc',
            allSettled: 'doc',
            any: 'doc',
            race: 'doc',
            reject: 'doc',
            resolve: 'doc',
        },
        Symbol: {
            for: 'doc',
            keyFor: 'doc',
            // Well-known symbols Babel's iterable and class helpers reference.
            iterator: 'helper',
            toPrimitive: 'helper',
        },
        Date: {
            now: 'doc',
            parse: 'doc',
            UTC: 'doc',
        },
        console: {
            log: 'doc',
        },
        ...Object.fromEntries(TYPED_ARRAYS.map(name => [name, TYPED_ARRAY_STATICS])),
    },
    missingMethods: {
        toSorted: 'copy first: `.slice().sort(compare)`',
        toReversed: 'copy first: `.slice().reverse()`',
        toSpliced: 'copy first: `var copy = a.slice(); copy.splice(...)`',
        with: 'copy first, then assign by index',
        at: 'index directly, e.g. `a[a.length - 1]`',
        flat: 'flatten with `.reduce()` and `.concat()`',
        flatMap: '`.map()` followed by a flatten',
        findLast: 'iterate backwards with a `for` loop',
        findLastIndex: 'iterate backwards with a `for` loop',
        matchAll: 'call `RegExp.prototype.exec()` in a loop with the `g` flag',
        normalize: 'not available — normalize before the request reaches the edge',
    },
    modules: ['querystring', 'crypto', 'buffer'],
};
