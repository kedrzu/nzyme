import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Package } from '@nzyme/project-utils/getPackages.js';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { collectIndexSourceFiles } from './collectIndexSourceFiles.js';
import { collectSymbols } from './collectSymbols.js';
import { getIndexSettings } from './IndexSettings.js';

/** Settings with every opt-in feature on: a `defineActor` kind and `pgTable` entities in one package. */
const settings = getIndexSettings({
    defineKinds: [{ kind: 'actor', section: 'Actors', callee: 'defineActor', nameKey: 'type', order: 40 }],
    entities: { tableFunctions: ['pgTable'], packages: ['@acme/database'] },
});

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nzyme-index-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function write(relPath: string, content: string): Promise<void> {
    const full = join(root, relPath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
}

describe('collectIndexSourceFiles', () => {
    it('collects .ts/.tsx/.vue and excludes declarations, tests, stories, and ignored dirs', async () => {
        await write('src/Good.ts', 'export const a = 1;');
        await write('src/Widget.vue', '<template></template>');
        await write('src/Page.tsx', 'export const b = 2;');
        await write('src/Good.d.ts', 'export declare const c: number;');
        await write('src/Good.test.ts', 'test');
        await write('src/Good.spec.ts', 'test');
        await write('src/Good.stories.tsx', 'story');
        await write('src/Good.stories.ts', 'story');
        await write('src/node_modules/dep/index.ts', 'export const d = 4;');
        await write('src/dist/built.ts', 'export const e = 5;');
        await write('src/.hidden/secret.ts', 'export const f = 6;');

        const files = await collectIndexSourceFiles(join(root, 'src'));
        const names = files.map(f => f.slice(root.length + 1)).toSorted();

        expect(names).toEqual(['src/Good.ts', 'src/Page.tsx', 'src/Widget.vue']);
    });

    it('returns [] for a missing directory', async () => {
        expect(await collectIndexSourceFiles(join(root, 'does-not-exist'))).toEqual([]);
    });
});

describe('collectSymbols', () => {
    function pkg(name: string, path: string): Package {
        return { path, packageJson: { name } };
    }

    it('walks packages, prefilters, and extracts defineX symbols with repo-relative paths', async () => {
        await write(
            'packages/backend/src/chat/ChatStartCommand.ts',
            `/** Starts a chat. */\nexport const ChatStartCommand = defineCommand({ name: 'ChatStart', deps: {} });`,
        );
        await write(
            'packages/backend/src/chat/ChatActor.ts',
            `export const ChatActor = defineActor({ type: 'chat', users: [], requests: {} });`,
        );
        // No marker → must be skipped by the string prefilter (and would fail to parse if read as TS).
        await write('packages/backend/src/notes.ts', `not typescript at all @@@`);

        const packages = [pkg('@acme/backend', join(root, 'packages/backend'))];
        const symbols = await collectSymbols({ root, packages, settings });

        expect(symbols).toContainEqual({
            kind: 'command',
            packageName: '@acme/backend',
            exportName: 'ChatStartCommand',
            importPath: '@acme/backend/chat/ChatStartCommand.js',
            internalName: 'ChatStart',
            description: 'Starts a chat.',
            signature: null,
            relPath: join('packages', 'backend', 'src', 'chat', 'ChatStartCommand.ts'),
        });
        expect(symbols).toContainEqual({
            kind: 'actor',
            packageName: '@acme/backend',
            exportName: 'ChatActor',
            importPath: '@acme/backend/chat/ChatActor.js',
            internalName: 'chat',
            description: null,
            signature: null,
            relPath: join('packages', 'backend', 'src', 'chat', 'ChatActor.ts'),
        });
        expect(symbols).toHaveLength(2);
    });

    it('skips packages with no name and no src dir gracefully', async () => {
        await write('packages/withsrc/src/Svc.ts', `export const Svc = defineService({ name: 'Svc' });`);

        const packages = [
            pkg('@acme/withsrc', join(root, 'packages/withsrc')),
            pkg('@acme/nosrc', join(root, 'packages/nosrc')),
            { path: join(root, 'packages/anon'), packageJson: {} },
        ];

        const symbols = await collectSymbols({ root, packages, settings });

        expect(symbols).toMatchObject([{ exportName: 'Svc', internalName: 'Svc' }]);
    });

    it('indexes root-layout Nuxt-app defineX symbols (no src/) but still excludes their .vue', async () => {
        // Root layout: a Nuxt app keeps code at the package root (services/, stores/, …), not src/.
        await write('packages/web-app/nuxt.config.ts', `export default {};`);
        await write(
            'packages/web-app/orders/services/OrderListStore.ts',
            `/** Order list store. */\nexport const OrderListStore = defineService({ name: 'OrderListStore' });`,
        );
        await write('packages/web-app/orders/OrderCard.vue', `<!-- A card. -->\n<script setup></script>`);

        const symbols = await collectSymbols({
            root,
            settings,
            packages: [pkg('@acme/web-app', join(root, 'packages/web-app'))],
        });

        // The root-layout service IS indexed (was previously dropped by the hardcoded src/-only scan)...
        expect(symbols).toContainEqual({
            kind: 'service',
            packageName: '@acme/web-app',
            exportName: 'OrderListStore',
            importPath: '@acme/web-app/orders/services/OrderListStore.js',
            internalName: 'OrderListStore',
            description: 'Order list store.',
            signature: null,
            relPath: join('packages', 'web-app', 'orders', 'services', 'OrderListStore.ts'),
        });
        // ...but the Nuxt app's .vue component is NOT (page/layout noise).
        expect(symbols.some(symbol => symbol.kind === 'component')).toBe(false);
    });

    it('parses a file that contains only a @util tag and no defineX marker (prefilter extension)', async () => {
        await write(
            'packages/utils/src/clamp.ts',
            `/**\n * Clamps a number.\n * @util\n */\nexport function clamp(v: number): number {\n    return v;\n}`,
        );

        const symbols = await collectSymbols({
            root,
            settings,
            packages: [pkg('@acme/utils', join(root, 'packages/utils'))],
        });

        expect(symbols).toMatchObject([
            {
                kind: 'util',
                packageName: '@acme/utils',
                exportName: 'clamp',
                importPath: '@acme/utils/clamp.js',
                description: 'Clamps a number.',
                signature: 'clamp(v: number): number',
            },
        ]);
    });

    it('indexes a .vue component for a non-app package (no nuxt.config)', async () => {
        await write(
            'packages/ui/src/InfoBox.vue',
            `<!-- An info box. -->\n<script lang="ts" setup></script>\n<template><div /></template>`,
        );

        const symbols = await collectSymbols({
            root,
            settings,
            packages: [pkg('@acme/ui', join(root, 'packages/ui'))],
        });

        expect(symbols).toMatchObject([
            {
                kind: 'component',
                packageName: '@acme/ui',
                exportName: 'InfoBox',
                importPath: '@acme/ui/InfoBox.vue',
                description: 'An info box.',
            },
        ]);
    });

    it('does NOT index .vue components for a Nuxt app package (has nuxt.config.ts)', async () => {
        await write('packages/web-app/nuxt.config.ts', `export default {};`);
        await write('packages/web-app/src/pages/Home.vue', `<!-- Home page. -->\n<template><div /></template>`);

        const symbols = await collectSymbols({
            root,
            settings,
            packages: [pkg('@acme/web-app', join(root, 'packages/web-app'))],
        });

        expect(symbols).toEqual([]);
    });

    it('extracts a pgTable entity only for a configured entity package', async () => {
        await write(
            'packages/database/src/schema/payment.ts',
            `export const paymentStatus = enumType('payment_status', []);\nexport const payment = pgTable('payment', { id: bigintStrict('id') });`,
        );

        const symbols = await collectSymbols({
            root,
            settings,
            packages: [pkg('@acme/database', join(root, 'packages/database'))],
        });

        expect(symbols).toMatchObject([
            {
                kind: 'entity',
                packageName: '@acme/database',
                exportName: 'payment',
                internalName: 'payment',
                importPath: '@acme/database/schema/payment.js',
            },
        ]);
        expect(symbols).toHaveLength(1);
    });

    it('does NOT extract a pgTable entity for a package outside the configured ones (gating)', async () => {
        await write(
            'packages/other/src/thing.ts',
            `export const thing = pgTable('thing', { id: bigintStrict('id') });`,
        );

        const symbols = await collectSymbols({
            root,
            settings,
            packages: [pkg('@acme/other', join(root, 'packages/other'))],
        });

        expect(symbols).toEqual([]);
    });

    it('extracts entities in every package when the config names no packages', async () => {
        await write('packages/other/src/thing.ts', `export const thing = pgTable('thing', {});`);

        const symbols = await collectSymbols({
            root,
            settings: getIndexSettings({ entities: { tableFunctions: ['pgTable'] } }),
            packages: [pkg('@acme/other', join(root, 'packages/other'))],
        });

        expect(symbols).toMatchObject([{ kind: 'entity', exportName: 'thing', internalName: 'thing' }]);
    });

    it('extracts neither entities nor unconfigured defineX kinds by default', async () => {
        await write(
            'packages/database/src/schema.ts',
            `export const thing = pgTable('thing', {});\nexport const ChatActor = defineActor({ type: 'chat' });`,
        );

        const symbols = await collectSymbols({
            root,
            settings: getIndexSettings({}),
            packages: [pkg('@acme/database', join(root, 'packages/database'))],
        });

        expect(symbols).toEqual([]);
    });
});
