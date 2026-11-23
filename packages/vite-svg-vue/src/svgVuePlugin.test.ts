import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';
import { rollup } from 'rollup';
import type { Plugin } from 'rollup';

import { svgVuePlugin } from './svgVuePlugin.js';

const fixtures = join(import.meta.dir, 'fixtures');

describe('svgVuePlugin', () => {
    test('loads `.svg?component` as the compiled component', async () => {
        const id = join(fixtures, 'arrow-left.svg?component');
        const { loaded, code } = await bundle(id);

        expect(loaded).toEqual([]);
        expect(code).toContain(`h('svg', mergeProps(attrs, callerAttrs, { innerHTML }))`);
    });

    test.each(['arrow-left.svg', 'arrow-left.svg?url', 'arrow-left.svg?raw', 'arrow-left.svg?component&inline'])(
        'leaves %s to the next plugin',
        async file => {
            const id = join(fixtures, file);
            const { loaded } = await bundle(id);

            expect(loaded).toEqual([id]);
        },
    );

    test('a missing file fails naming its path', async () => {
        const path = join(fixtures, 'missing.svg');

        await expect(bundle(`${path}?component`)).rejects.toThrow(`Cannot read SVG component ${path}`);
    });

    test('an unparsable file fails naming its path', async () => {
        const path = join(fixtures, 'broken.svg');

        await expect(bundle(`${path}?component`)).rejects.toThrow(`Cannot compile SVG component ${path}`);
    });
});

interface BundleResult {
    /** Ids the plugin did not claim, which reached the fallback loader. */
    loaded: string[];
    code: string;
}

/** Bundles a one-line entry importing `id` through the plugin, with a fallback loader behind it. */
async function bundle(id: string): Promise<BundleResult> {
    const entry = '\0entry';
    const loaded: string[] = [];
    const harness: Plugin = {
        name: 'harness',
        resolveId: source => source,
        load: loadedId => {
            if (loadedId === entry) {
                return `export { default } from ${JSON.stringify(id)};`;
            }

            loaded.push(loadedId);
            return 'export default null;';
        },
    };

    const build = await rollup({ input: entry, external: ['vue'], plugins: [svgVuePlugin(), harness] });
    const { output } = await build.generate({ format: 'es' });
    await build.close();

    const [chunk] = output;
    return { loaded, code: chunk.code };
}
