import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { FS_TRACE_DIR_ENV } from '@nzyme/affected/fsTrace/FsTraceLine.js';
import { readFsTrace } from '@nzyme/affected/fsTrace/readFsTrace.js';

// A real `bun test` run with the preload listed first in its bunfig, as a consumer runs it.
const preloadPath = path.join(import.meta.dir, 'fsPreload.ts');
const isFsTracedPath = path.join(import.meta.dir, 'isFsTraced.ts');

let root: string;

beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'fs-trace-')));
    await writeFiles({
        'bunfig.toml': `[test]\npreload = [${JSON.stringify(preloadPath)}, "./setup.ts"]\n`,
        // A later preload importing `node:fs` the ESM way: what a consumer's test harness does.
        'setup.ts': `import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n`,
        'data/a.json': '{}',
        'data/b.json': '{}',
        'data/nested/c.json': '{}',
        'other/notes.md': '# notes\n',
        'reads.test.ts': `import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as fs from 'node:fs';
import { expect, test } from 'bun:test';
import { isFsTraced } from ${JSON.stringify(isFsTracedPath)};

test('reads', async () => {
    expect(isFsTraced(readFileSync)).toBe(true);
    expect(isFsTraced(readFile)).toBe(true);
    readFileSync('data/a.json');
    await readFile(new URL('./other/notes.md', import.meta.url));
    fs.statSync('data/b.json');
    existsSync('missing.json');
    readdirSync('data');
    readdirSync('data/nested', { recursive: true });
    await Bun.file('data/nested/c.json').text();
});
`,
        'writes.test.ts': `import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test } from 'bun:test';

test('writes, then reads its output, and starts a process', () => {
    mkdirSync('out', { recursive: true });
    writeFileSync('out/result.txt', 'x');
    readFileSync('out/result.txt');
    Bun.spawnSync(['true']);
});
`,
    });
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

test('records what each test file read, listed and wrote, and whether it started a process', async () => {
    const traceDir = path.join(root, '.trace');
    await mkdir(traceDir);
    const child = Bun.spawn([process.execPath, 'test'], {
        cwd: root,
        env: { ...process.env, [FS_TRACE_DIR_ENV]: traceDir },
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(exitCode, stderr).toBe(0);

    const trace = await readFsTrace(traceDir, root);
    expect(trace?.get('reads.test.ts')).toEqual({
        files: ['data/a.json', 'data/b.json', 'data/nested/c.json', 'missing.json', 'other/notes.md'],
        dirs: ['data'],
        trees: ['data/nested'],
        opaque: false,
    });
    expect(trace?.get('writes.test.ts')).toEqual({ files: [], dirs: [], trees: [], opaque: true });
});

test('a run without the preload is not traced', async () => {
    expect(await readFsTrace(path.join(root, 'no-trace'), root)).toBeNull();
});

async function writeFiles(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await writeFile(path.join(root, file), content);
    }
}
