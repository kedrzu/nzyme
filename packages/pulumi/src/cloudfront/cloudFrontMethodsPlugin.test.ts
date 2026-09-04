import * as vm from 'node:vm';

import { transformSync } from '@babel/core';
import { expect, test } from 'bun:test';

import { assertCloudFrontFunctionCode } from './assertCloudFrontFunctionCode.js';
import { cloudFrontMethodsPlugin } from './cloudFrontMethodsPlugin.js';

test('rewrites array sugar methods to ES5 helpers that behave the same', () => {
    expect(evaluate('[3, 1, 2].toSorted(function (a, b) { return a - b; })')).toEqual([1, 2, 3]);
    expect(evaluate('[1, 2, 3].toReversed()')).toEqual([3, 2, 1]);
    expect(evaluate('[1, 2, 3].toSpliced(1, 1, 9, 9)')).toEqual([1, 9, 9, 3]);
    expect(evaluate('[1, 2, 3].with(-1, 9)')).toEqual([1, 2, 9]);
    expect(evaluate('[1, 2, 3].at(-1)')).toBe(3);
    expect(evaluate('"abc".at(-1)')).toBe('c');
    expect(evaluate('[1, [2, [3]]].flat()')).toEqual([1, 2, [3]]);
    expect(evaluate('[1, [2, [3]]].flat(2)')).toEqual([1, 2, 3]);
    expect(evaluate('[1, 2].flatMap(function (x) { return [x, x]; })')).toEqual([1, 1, 2, 2]);
    expect(evaluate('[1, 2, 3].findLast(function (x) { return x < 3; })')).toBe(2);
    expect(evaluate('[1, 2, 3].findLastIndex(function (x) { return x < 3; })')).toBe(1);
    expect(evaluate('Object.fromEntries([["a", 1]])')).toEqual({ a: 1 });
    expect(evaluate('Object.hasOwn({ a: 1 }, "a")')).toBe(true);
});

test('the source keeps none of the rewritten method names, so the runtime check passes', () => {
    const code = compile('global.handler = function () { return [3, 1, 2].toSorted().at(0); };');

    expect(code).not.toContain('.toSorted(');
    expect(code).not.toContain('.at(');
    expect(() => assertCloudFrontFunctionCode(code, 'methods-plugin-output')).not.toThrow();
});

test('a receiver that is not an array falls back to its own method', () => {
    const source = `
        var receiver = { toSorted: function () { return "own"; } };
        var result = receiver.toSorted();
    `;

    expect(evaluateSource(source)).toBe('own');
});

test('leaves a shadowed Object alone', () => {
    const source = `
        var Object = { fromEntries: function () { return "shadowed"; } };
        var result = Object.fromEntries([]);
    `;

    expect(evaluateSource(source)).toBe('shadowed');
});

test('leaves a call it cannot map onto the helper signature for the runtime check to report', () => {
    const code = compile('var result = items.with.apply(items, args);');

    // `.with` is not in callee position of a member call here, so there is nothing to rewrite.
    expect(code).toContain('items.with.apply');
});

test('injects each helper once, however many call sites use it', () => {
    const code = compile('var a = one.toSorted(); var b = two.toSorted(); var c = three.at(0);');

    expect(code.match(/function _cf_toSorted/g)).toHaveLength(1);
    expect(code.match(/function _cf_fallback/g)).toHaveLength(1);
});

function evaluate(expression: string) {
    return evaluateSource(`var result = ${expression};`);
}

function evaluateSource(source: string) {
    return vm.runInNewContext(`${compile(source)}\nresult;`, {}) as unknown;
}

function compile(code: string) {
    const result = transformSync(code, {
        babelrc: false,
        configFile: false,
        filename: 'cloudFrontFunction.js',
        sourceType: 'script',
        plugins: [cloudFrontMethodsPlugin],
    });

    if (!result?.code) {
        throw new Error('Babel produced no output');
    }

    return result.code;
}
