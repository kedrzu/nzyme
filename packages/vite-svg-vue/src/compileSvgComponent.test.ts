import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { compileSvgComponent } from './compileSvgComponent.js';

const fixtures = join(import.meta.dir, 'fixtures');

describe('compileSvgComponent', () => {
    test('emits a functional component with root attrs and static innerHTML', async () => {
        const path = join(fixtures, 'arrow-left.svg');
        const code = compileSvgComponent(await readFile(path, 'utf8'), { path });

        expect(code).toBe(
            [
                `import { h, mergeProps } from 'vue';`,
                `const attrs = {"xmlns":"http://www.w3.org/2000/svg","width":"24","height":"24","fill":"none","class":"icon","viewBox":"0 0 24 24"};`,
                `const innerHTML = "<path stroke=\\"currentColor\\" stroke-width=\\"2\\" d=\\"M19 12H5m7 7-7-7 7-7\\"/>";`,
                `const SvgComponent = (_props, { attrs: callerAttrs }) => h('svg', mergeProps(attrs, callerAttrs, { innerHTML }));`,
                `SvgComponent.inheritAttrs = false;`,
                `SvgComponent.displayName = "ArrowLeft";`,
                `export default SvgComponent;`,
                '',
            ].join('\n'),
        );
    });

    test('multipass keeps the root attrs the single pass captures', async () => {
        const path = join(fixtures, 'arrow-left.svg');
        const source = await readFile(path, 'utf8');

        expect(parseModule(compileSvgComponent(source, { path, svgo: { multipass: true } }))).toEqual(
            parseModule(compileSvgComponent(source, { path })),
        );
    });

    test('an empty <svg/> keeps its attrs and gets an empty innerHTML', async () => {
        const path = join(fixtures, 'empty.svg');
        const parts = parseModule(compileSvgComponent(await readFile(path, 'utf8'), { path, svgo: { plugins: [] } }));

        expect(parts).toEqual({
            attrs: { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 1 1' },
            innerHTML: '',
            displayName: 'Empty',
        });
    });

    test('doctype, XML instruction and comments around the root never reach the component', async () => {
        const path = join(fixtures, 'prolog.svg');
        const parts = parseModule(compileSvgComponent(await readFile(path, 'utf8'), { path, svgo: { plugins: [] } }));

        expect(parts.attrs).toEqual({ xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 10 10' });
        expect(parts.innerHTML).toBe('<!--inner comment--><rect width="10" height="10"/>');
    });

    test('pretty-printed svgo output splits without stray whitespace', async () => {
        const path = join(fixtures, 'prolog.svg');
        const parts = parseModule(
            compileSvgComponent(await readFile(path, 'utf8'), {
                path,
                svgo: { plugins: [], js2svg: { pretty: true } },
            }),
        );

        expect(parts.innerHTML).toBe('<!--inner comment--><rect width="10" height="10"/>');
    });

    describe.each([
        ['preset-default', {}],
        ['no plugins', { plugins: [] }],
        ['no plugins, multipass', { plugins: [], multipass: true }],
    ])('with %s, the malicious fixture', (_name, svgo) => {
        test('loses scripts, event handlers and executable URLs', async () => {
            const path = join(fixtures, 'malicious.svg');
            const code = compileSvgComponent(await readFile(path, 'utf8'), { path, svgo });
            const parts = parseModule(code);
            const markup = `${JSON.stringify(parts.attrs)}${parts.innerHTML}`.toLowerCase();

            expect(markup).not.toContain('<script');
            expect(markup).not.toMatch(/\son[a-z]+=/);
            expect(Object.keys(parts.attrs).filter(name => name.toLowerCase().startsWith('on'))).toEqual([]);
            expect(markup.replace(/\s/g, '')).not.toContain('javascript:');
            expect(markup).not.toContain('srcdoc');
            expect(markup).not.toContain('alert');
            // Harmless content survives.
            expect(markup).toContain('<path');
            expect(markup).toContain('<foreignobject');
        });
    });

    test('an unparsable file fails naming its path', async () => {
        const path = join(fixtures, 'broken.svg');
        const source = await readFile(path, 'utf8');

        expect(() => compileSvgComponent(source, { path })).toThrow(`Cannot compile SVG component ${path}`);
    });

    test('a root other than <svg> fails naming the path', async () => {
        const path = join(fixtures, 'not-svg.svg');
        const source = await readFile(path, 'utf8');

        expect(() => compileSvgComponent(source, { path, svgo: { plugins: [] } })).toThrow(
            `Cannot compile SVG component ${path}: Expected <svg> as the root element, found <html>`,
        );
    });

    test('an empty file fails naming the path', () => {
        const path = '/icons/blank.svg';

        expect(() => compileSvgComponent('', { path })).toThrow(
            `Cannot compile SVG component ${path}: Expected exactly one root element, found 0`,
        );
    });
});

interface ModuleParts {
    attrs: Record<string, unknown>;
    innerHTML: string;
    displayName: string;
}

/** Reads back the JSON literals the generated module embeds. */
function parseModule(code: string): ModuleParts {
    const attrs = parseLiteral(code, 'const attrs = ');
    const innerHTML = parseLiteral(code, 'const innerHTML = ');
    const displayName = parseLiteral(code, 'SvgComponent.displayName = ');
    if (
        typeof attrs !== 'object' ||
        attrs === null ||
        typeof innerHTML !== 'string' ||
        typeof displayName !== 'string'
    ) {
        throw new Error(`Unexpected module shape:\n${code}`);
    }

    return { attrs: Object.fromEntries(Object.entries(attrs)), innerHTML, displayName };
}

function parseLiteral(code: string, prefix: string): unknown {
    const line = code.split('\n').find(l => l.startsWith(prefix));
    expect(line).toBeDefined();
    return JSON.parse(line!.slice(prefix.length, -1));
}
