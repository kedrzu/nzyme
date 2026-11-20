import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { formatPlaywrightTestList, readPlaywrightTestList } from './playwrightTestList.js';

const tmpDirs: string[] = [];

afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

test('reads describe blocks into the title path, once per test whatever the projects', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-playwright-list-'));
    tmpDirs.push(root);
    await fs.mkdir(path.join(root, 'e2e'));
    const projectTests = [{ projectName: 'a' }, { projectName: 'b' }];
    // The shape `playwright test --list --reporter=json` printed (Playwright 1.65), trimmed.
    const report = {
        config: { rootDir: path.join(root, 'e2e'), projects: [{ name: 'a' }, { name: 'b' }] },
        suites: [
            {
                title: 'x.spec.ts',
                file: 'x.spec.ts',
                specs: [{ title: 'top', file: 'x.spec.ts', tests: projectTests }],
                suites: [
                    {
                        title: 'grp',
                        file: 'x.spec.ts',
                        specs: [{ title: 'in', file: 'x.spec.ts', tests: projectTests }],
                        suites: [
                            {
                                title: 'inner',
                                file: 'x.spec.ts',
                                specs: [{ title: 'deep', file: 'x.spec.ts', tests: projectTests }],
                            },
                        ],
                    },
                ],
            },
        ],
        errors: [],
    };
    const file = path.join(root, 'units.json');
    await fs.writeFile(file, JSON.stringify(report));

    const tests = await readPlaywrightTestList(file, root);

    expect(tests).toEqual([
        { unit: { file: 'e2e/x.spec.ts', title: ['top'] }, location: 'x.spec.ts' },
        { unit: { file: 'e2e/x.spec.ts', title: ['grp', 'in'] }, location: 'x.spec.ts' },
        { unit: { file: 'e2e/x.spec.ts', title: ['grp', 'inner', 'deep'] }, location: 'x.spec.ts' },
    ]);
    expect(formatPlaywrightTestList(tests)).toBe(
        'x.spec.ts › top\nx.spec.ts › grp › in\nx.spec.ts › grp › inner › deep\n',
    );
});

test('a title Playwright cannot read back cuts the path there, selecting more, never less', () => {
    const list = formatPlaywrightTestList([
        { unit: { file: 'e2e/a.spec.ts', title: ['a > b'] }, location: 'a.spec.ts' },
        { unit: { file: 'e2e/a.spec.ts', title: ['grp', 'x › y'] }, location: 'a.spec.ts' },
        { unit: { file: 'e2e/a.spec.ts', title: [' padded', 'in'] }, location: 'a.spec.ts' },
    ]);

    expect(list).toBe('a.spec.ts › a > b\na.spec.ts › grp\na.spec.ts\n');
});

test('an empty selection is an empty list', () => {
    expect(formatPlaywrightTestList([])).toBe('');
});
