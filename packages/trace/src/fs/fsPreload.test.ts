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
        'data/config.json': '{}',
        // A built module that reads a file once and keeps it, with the source map `tsc` writes beside it.
        'lib/memo.js': `import { readFileSync } from 'node:fs';
let cached;
export function readConfig() {
    cached ??= readFileSync('data/config.json', 'utf8');
    return cached;
}
//# sourceMappingURL=memo.js.map
`,
        'lib/memo.js.map': JSON.stringify({ version: 3, sources: ['../src/memo.ts'], mappings: '' }),
        'memo-a.test.ts': memoTest('a'),
        'memo-b.test.ts': memoTest('b'),
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
        'spawns.test.ts': `import { test } from 'bun:test';

test('starts a process', () => {
    Bun.spawnSync(['true']);
});
`,
        'shell.test.ts': `import { $ } from 'bun';
import { test } from 'bun:test';

test('reads through the Bun shell', async () => {
    await $\`cat data/a.json\`.quiet();
});
`,
        'copies.test.ts': `import { copyFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'bun:test';

test('copies a file and a directory', () => {
    const out = path.join(tmpdir(), \`fs-trace-copy-\${process.pid}\`);
    copyFileSync('data/b.json', path.join(tmpdir(), \`fs-trace-b-\${process.pid}.json\`));
    cpSync('data', out, { recursive: true });
});
`,
    });
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

test('records what each test file read and listed, and whether it did what the trace cannot see', async () => {
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
    expect(trace?.tests.get('reads.test.ts')).toEqual({
        files: ['data/a.json', 'data/b.json', 'data/nested/c.json', 'missing.json', 'other/notes.md'],
        dirs: ['data'],
        trees: ['data/nested'],
        opaque: false,
    });
    expect(trace?.tests.get('spawns.test.ts')).toEqual({ files: [], dirs: [], trees: [], opaque: true });
    expect(trace?.tests.get('shell.test.ts')).toEqual({ files: [], dirs: [], trees: [], opaque: true });
    // `cpSync` walks the directory through the wrapped functions too: those reads are recorded as well.
    expect(trace?.tests.get('copies.test.ts')).toMatchObject({ opaque: true });
    expect(trace?.tests.get('copies.test.ts')?.files).toContain('data/b.json');

    // Read once, by whichever test file ran first: shared under the module (its source), for every
    // test file that loads it. What a test file read itself is its own.
    expect(trace?.shared).toEqual([
        { reader: 'src/memo.ts', files: ['data/config.json'], dirs: [], trees: [], opaque: false },
    ]);
});

test('a run without the preload is not traced', async () => {
    expect(await readFsTrace(path.join(root, 'no-trace'), root)).toBeNull();
});

function memoTest(name: string): string {
    return `import { expect, test } from 'bun:test';
import { readConfig } from './lib/memo.js';

test('${name} reads the memoised config', () => {
    expect(readConfig()).toBe('{}');
});
`;
}

async function writeFiles(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await writeFile(path.join(root, file), content);
    }
}
