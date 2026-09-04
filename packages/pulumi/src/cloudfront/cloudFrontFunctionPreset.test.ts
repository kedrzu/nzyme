import { transformSync } from '@babel/core';
import { expect, test } from 'bun:test';

import { assertCloudFrontFunctionCode } from './assertCloudFrontFunctionCode.js';
import { cloudFrontFunctionPreset } from './cloudFrontFunctionPreset.js';

test('keeps the syntax cloudfront-js-2.0 already supports', () => {
    expect(compile('var double = a => a * 2;')).toContain('=>');
    expect(compile('const answer = 42;')).toContain('const');
    expect(compile('let total = 0;')).toContain('let');
    expect(compile('var greeting = `hi ${name}`;')).toContain('`hi ${name}`');
    expect(compile('var squared = base ** 2;')).toContain('**');
    expect(compile('var million = 1_000_000;')).toContain('1_000_000');
    // `transform-typeof-symbol` would wrap this in a `_typeof` helper for no gain.
    expect(compile('var kind = typeof value;')).toContain('typeof value');
});

test('downlevels the syntax cloudfront-js-2.0 does not have', () => {
    expect(compile('for (const item of items) { sink(item); }')).not.toContain(' of ');
    expect(compile('var all = [first, ...rest];')).not.toContain('...');
    expect(compile('var name = user?.name;')).not.toContain('?.');
    expect(compile('var name = user ?? fallback;')).not.toContain('??');
    expect(compile('var { id } = user;')).toContain('user.id');
    expect(compile('class Point {}')).not.toContain('class Point');
    expect(compile('function greet(name = "x") { return name; }')).not.toContain('= "x")');
});

test('compiled output passes the runtime check', () => {
    const code = compile(`
        global.handler = event => {
            const { request } = event;
            const parts = [...request.uri.split('/'), request.method];
            const kept = [];
            for (const part of parts) {
                if (part?.length) {
                    kept.push(\`\${part}!\`);
                }
            }

            request.uri = kept.join('/');

            return request;
        };
    `);

    expect(() => assertCloudFrontFunctionCode(code, 'preset-output')).not.toThrow();
});

function compile(code: string) {
    const result = transformSync(code, {
        babelrc: false,
        configFile: false,
        filename: 'cloudFrontFunction.js',
        sourceType: 'script',
        presets: [cloudFrontFunctionPreset],
    });

    if (!result?.code) {
        throw new Error('Babel produced no output');
    }

    return result.code;
}
