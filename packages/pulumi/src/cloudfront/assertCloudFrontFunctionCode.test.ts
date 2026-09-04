import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect, test } from 'bun:test';

import { assertCloudFrontFunctionCode } from './assertCloudFrontFunctionCode.js';
import { cloudFrontRuntime } from './cloudFrontRuntime.js';

/**
 * A hand-written SYNTHETIC viewer-request bundle — not a capture of any real deployed function (see
 * the fixture's own header comment). It only reproduces the *shape* of a Babel+terser CloudFront
 * bundle, with one deliberate bug: `.toSorted()`. Everything else in it — `global.handler`, the
 * Babel iterable helper that spells `"Map"`/`"Set"` as string literals, `Array.from`,
 * `Symbol.iterator` — is code the runtime runs today and must not be flagged.
 */
const SYNTHETIC_BUNDLE = fs.readFileSync(
    path.join(import.meta.dir, '__fixtures__', 'syntheticViewerRequestBundle.js'),
    'utf8',
);

test('rejects the synthetic bundle, and only because of toSorted', () => {
    const problems = collectProblems(SYNTHETIC_BUNDLE);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('`.toSorted()`');
});

test('reads identifiers, not text — a missing API named in a string is not a use of it', () => {
    expect(() => assertCloudFrontFunctionCode('function f(n) { return "Map" === n; }', 'literals')).not.toThrow();
    expect(() => assertCloudFrontFunctionCode('var x = { toSorted: 1 }.toSorted;', 'literals')).not.toThrow();
});

test('rejects globals the runtime does not have', () => {
    expect(collectProblems('var seen = new Set();')).toEqual(['line 1: `Set` is not available in the runtime']);
    expect(collectProblems('var env = process.env.ENV;')).toEqual([
        'line 1: `process` is not available in the runtime',
    ]);
    // `class extends` compiles down to `Reflect.construct`, which the runtime lacks — so leaving
    // `Reflect` off the model is what makes `class extends` fail here instead of at the edge.
    expect(collectProblems('function f(Base) { return Reflect.construct(Base, []); }')).toEqual([
        'line 1: `Reflect` is not available in the runtime',
    ]);
});

test('accepts an identifier that is bound in scope even when it shadows a missing global', () => {
    expect(() => assertCloudFrontFunctionCode('function f(Set) { return new Set(); }', 'shadow')).not.toThrow();
});

test('allows require only for the built-in modules', () => {
    for (const module of cloudFrontRuntime.modules) {
        expect(() => assertCloudFrontFunctionCode(`var m = require('${module}');`, 'modules')).not.toThrow();
    }

    expect(collectProblems(`var fs = require('fs');`)).toEqual(['line 1: `require` is not available in the runtime']);
});

test('rejects static methods the runtime does not have', () => {
    expect(collectProblems('function f(pairs) { return Object.fromEntries(pairs); }')).toEqual([
        'line 1: `Object.fromEntries()` is not available in the runtime',
    ]);
    expect(() =>
        assertCloudFrontFunctionCode('function f(o) { return Object.assign({}, o); }', 'statics'),
    ).not.toThrow();
});

test('rejects syntax the runtime cannot run', () => {
    expect(collectProblems('function* gen() { yield 1; }')).toEqual([
        'line 1: generator functions are not supported by the runtime',
        'line 1: `yield` is not supported by the runtime',
    ]);
    expect(collectProblems('async function f(xs, g) { for await (var x of xs) { g(x); } }')).toEqual([
        'line 1: `for await` is not supported by the runtime',
    ]);
});

test('rejects a bundle over the CloudFront Functions size limit, naming the size', () => {
    const oversized = `var pad = "${'x'.repeat(cloudFrontRuntime.maxFunctionBytes)}";`;

    expect(collectProblems(oversized)).toEqual([
        `bundle is ${oversized.length} bytes, over the ${cloudFrontRuntime.maxFunctionBytes} byte CloudFront Functions limit`,
    ]);
});

function collectProblems(code: string) {
    try {
        assertCloudFrontFunctionCode(code, 'test');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return message
            .split('\n')
            .filter(line => line.startsWith('  - '))
            .map(line => line.slice('  - '.length));
    }

    throw new Error('Expected the code to be rejected');
}
