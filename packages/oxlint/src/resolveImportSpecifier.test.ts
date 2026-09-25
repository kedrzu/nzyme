import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { resolveImportSpecifier } from './resolveImportSpecifier.js';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nzyme-oxlint-resolve-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function write(relativePath: string): Promise<void> {
    const path = join(root, relativePath);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, 'export {};\n', 'utf8');
}

describe('resolveImportSpecifier', () => {
    it('maps the `.js` extension this repo writes back to the `.ts` source', async () => {
        await write('helpers.ts');

        expect(resolveImportSpecifier(join(root, 'caller.ts'), './helpers.js')).toBe(join(root, 'helpers.ts'));
    });

    it('falls back to `.tsx`', async () => {
        await write('Widget.tsx');

        expect(resolveImportSpecifier(join(root, 'caller.ts'), './Widget.js')).toBe(join(root, 'Widget.tsx'));
    });

    it('prefers the `.ts` source over a real `.js` file of the same name', async () => {
        await write('dual.ts');
        await write('dual.js');

        expect(resolveImportSpecifier(join(root, 'caller.ts'), './dual.js')).toBe(join(root, 'dual.ts'));
    });

    it('resolves a specifier that names an existing file outright', async () => {
        await write('legacy.js');

        expect(resolveImportSpecifier(join(root, 'caller.ts'), './legacy.js')).toBe(join(root, 'legacy.js'));
    });

    it('resolves an extensionless specifier and a directory index', async () => {
        await write('plain.ts');
        await write('nested/index.ts');

        expect(resolveImportSpecifier(join(root, 'caller.ts'), './plain')).toBe(join(root, 'plain.ts'));
        expect(resolveImportSpecifier(join(root, 'caller.ts'), './nested')).toBe(join(root, 'nested', 'index.ts'));
    });

    it('resolves relative to the importing file, not the working directory', async () => {
        await write('helpers.ts');

        expect(resolveImportSpecifier(join(root, 'deep', 'caller.ts'), '../helpers.js')).toBe(join(root, 'helpers.ts'));
    });

    it('declines a bare package specifier, which is deliberately out of scope', () => {
        expect(resolveImportSpecifier(join(root, 'caller.ts'), '@nzyme/utils')).toBeUndefined();
    });

    it('declines a relative specifier with nothing behind it', () => {
        expect(resolveImportSpecifier(join(root, 'caller.ts'), './missing.js')).toBeUndefined();
    });
});
