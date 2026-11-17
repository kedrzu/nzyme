import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { mapBrowserAssets } from './browserAssets.js';
import type { TracedApp } from './TracedApp.js';

let root: string;
const apps: TracedApp[] = [
    { origin: 'http://localhost:3300', publicDir: 'app/public', outputDir: 'app/.output/public' },
];

beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'trace-assets-'));
    for (const file of ['app/public/img/hero.png', 'app/public/favicon.svg', 'app/.output/public/assets/entry.js']) {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await writeFile(path.join(root, file), 'x');
    }
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

test('a fetched file of an app public directory is an asset, also behind an image-service prefix', () => {
    const assets = mapBrowserAssets({
        urls: [
            'http://localhost:3300/favicon.svg',
            'http://localhost:3300/_ipx/w_390&f_avif/img/hero.png?v=1',
            'http://localhost:3300/assets/entry.js',
            'http://localhost:3300/us',
            'http://localhost:4400/favicon.svg',
        ],
        apps,
        root,
    });

    expect(assets.toSorted()).toEqual(['app/public/favicon.svg', 'app/public/img/hero.png']);
});
