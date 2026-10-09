import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

const CLI_PATH = new URL('../cli.ts', import.meta.url).pathname;

/**
 * End-to-end test of `nzyme index`: the real CLI run in a throwaway workspace, so workspace
 * discovery, reading the `nzyme.index` config from the root package.json and writing the files are
 * all covered, not just the pure `collectSymbols` → `renderMarkdown` pipeline.
 */

const root = await realpath(await mkdtemp(join(tmpdir(), 'nzyme-index-command-')));

beforeAll(async () => {
    // A lockfile is what makes the workspace discovery recognise a bun workspace.
    await write('bun.lock', '');
    await writeJson('package.json', {
        name: 'fixture-root',
        private: true,
        workspaces: ['packages/*'],
        nzyme: {
            index: {
                globalUtilPackages: ['@fix/utils'],
                defineKinds: [{ kind: 'actor', section: 'Actors', callee: 'defineActor', nameKey: 'type', order: 40 }],
                entities: { tableFunctions: ['pgTable'], packages: ['@fix/alpha'] },
            },
        },
    });

    // alpha: a service, a configured actor, an entity and a package-local @util helper.
    await writeJson('packages/alpha/package.json', { name: '@fix/alpha', description: 'Alpha pkg' });
    await write(
        'packages/alpha/src/AlphaService.ts',
        `/** Alpha svc. */\nexport const AlphaService = defineService({ name: 'AlphaService' });`,
    );
    await write('packages/alpha/src/AlphaActor.ts', `export const AlphaActor = defineActor({ type: 'alpha' });`);
    await write('packages/alpha/src/schema.ts', `export const order = pgTable('orders', {});`);
    await write(
        'packages/alpha/src/helpers.ts',
        `/**\n * Adds.\n * @util\n */\nexport function addUp(a: number, b: number): number { return a + b; }`,
    );

    // utils: a foundational package — its @util helpers also go to the root UTILS.md.
    await writeJson('packages/utils/package.json', { name: '@fix/utils', description: 'Utils pkg' });
    await write(
        'packages/utils/src/clamp.ts',
        `/**\n * Clamps.\n * @util\n */\nexport function clamp(v: number): number { return v; }`,
    );

    // beta: no description, and a malformed defineService "call" — TypeScript's error-tolerant
    // parser recovers no CallExpression from it, so it yields no symbol; the crawl must go on.
    await writeJson('packages/beta/package.json', { name: '@fix/beta' });
    await write('packages/beta/src/Broken.ts', `export const X = defineService not a real call @@@ {{{ garbage`);

    // gamma: a Nuxt app (has nuxt.config.ts) — its .vue files must be excluded as component noise.
    await writeJson('packages/gamma/package.json', { name: '@fix/gamma', description: 'Gamma app' });
    await write('packages/gamma/nuxt.config.ts', '');
    await write('packages/gamma/src/Widget.vue', '<!-- A widget. -->\n<script setup></script>');
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('nzyme index', () => {
    it('writes the root INDEX.md/UTILS.md and an INDEX.md for every package with symbols', async () => {
        expect(await runIndex()).toBe(0);

        const rootIndex = await read('INDEX.md');
        expect(rootIndex).toContain(
            '- **@fix/alpha** (`packages/alpha`): Alpha pkg — [INDEX.md](./packages/alpha/INDEX.md)',
        );
        expect(rootIndex).toContain('- **@fix/beta** (`packages/beta`): _(no description)_\n');
        expect(rootIndex).toContain('- **@fix/gamma** (`packages/gamma`): Gamma app\n');

        const utils = await read('UTILS.md');
        expect(utils).toContain('- `clamp(v: number): number` — Clamps. (`@fix/utils/clamp.js`)');
        expect(utils).not.toContain('addUp');

        const alphaIndex = await read('packages/alpha/INDEX.md');
        expect(alphaIndex).toContain(
            [
                '## Services',
                '',
                '- **AlphaService** — `@fix/alpha/AlphaService.js` — name: `AlphaService` — Alpha svc.',
                '',
                '## Actors',
                '',
                '- **AlphaActor** — `@fix/alpha/AlphaActor.js` — type: `alpha`',
                '',
                '## Entities',
                '',
                '- **order** — `@fix/alpha/schema.js` — table: `orders`',
                '',
                '## Utils',
                '',
                '- `addUp(a: number, b: number): number` — Adds. (`@fix/alpha/helpers.js`)',
                '',
            ].join('\n'),
        );

        expect(await exists('packages/utils/INDEX.md')).toBe(true);
        expect(await exists('packages/beta/INDEX.md')).toBe(false);
        expect(await exists('packages/gamma/INDEX.md')).toBe(false);
    });

    it('is idempotent: a second run leaves byte-identical files', async () => {
        expect(await runIndex()).toBe(0);
        const first = await Promise.all(['INDEX.md', 'UTILS.md', 'packages/alpha/INDEX.md'].map(read));

        expect(await runIndex()).toBe(0);
        const second = await Promise.all(['INDEX.md', 'UTILS.md', 'packages/alpha/INDEX.md'].map(read));

        expect(second).toEqual(first);
    });

    it('removes the INDEX.md of a package that lost its last symbol', async () => {
        await writeJson('packages/delta/package.json', { name: '@fix/delta', description: 'Delta pkg' });
        await write(
            'packages/delta/src/DeltaService.ts',
            `export const DeltaService = defineService({ name: 'DeltaService' });`,
        );
        expect(await runIndex()).toBe(0);
        expect(await exists('packages/delta/INDEX.md')).toBe(true);

        await rm(join(root, 'packages/delta/src'), { recursive: true });
        expect(await runIndex()).toBe(0);
        expect(await exists('packages/delta/INDEX.md')).toBe(false);
    });
});

function runIndex(): Promise<number> {
    const child = Bun.spawn([process.execPath, '--conditions=source', CLI_PATH, 'index'], {
        cwd: root,
        stdout: 'ignore',
        stderr: 'ignore',
    });
    return child.exited;
}

async function write(relPath: string, content: string): Promise<void> {
    const full = join(root, relPath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
}

function writeJson(relPath: string, value: unknown): Promise<void> {
    return write(relPath, JSON.stringify(value, null, 4));
}

function read(relPath: string): Promise<string> {
    return readFile(join(root, relPath), 'utf8');
}

async function exists(relPath: string): Promise<boolean> {
    try {
        await readFile(join(root, relPath));
        return true;
    } catch {
        return false;
    }
}
