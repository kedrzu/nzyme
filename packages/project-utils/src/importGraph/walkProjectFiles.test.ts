import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { clearIgnoreCache } from '../isFileIgnored.js';
import { walkProjectFiles } from './walkProjectFiles.js';

let root: string;

beforeAll(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'walk-project-files-')));
    spawnSync('git', ['init', '-q'], { cwd: root });
    const files: Record<string, string> = {
        '.gitignore': ['dist/', '*.loc.ts', '*.log', '!keep.log'].join('\n'),
        'src/a.ts': '',
        'src/b/c.ts': '',
        'src/Messages.loc.ts': '',
        'src/Messages.loc.yaml': '',
        'dist/a.js': '',
        'packages/x/dist/a.js': '',
        'node_modules/dep/index.js': '',
        'debug.log': '',
        'keep.log': '',
        'packages/x/.gitignore': 'generated/\n',
        'packages/x/generated/out.ts': '',
        'packages/x/src/index.ts': '',
        'packages/x/__fixtures__/data.json': '',
        '.storybook/main.ts': '',
    };
    for (const [name, content] of Object.entries(files)) {
        fs.outputFileSync(path.join(root, name), content);
    }
    clearIgnoreCache();
});

afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    clearIgnoreCache();
});

describe('walkProjectFiles', () => {
    it('lists the files git does not ignore, sorted and root-relative', async () => {
        expect(await walkProjectFiles(root)).toEqual([
            '.gitignore',
            '.storybook/main.ts',
            'keep.log',
            'packages/x/.gitignore',
            'packages/x/__fixtures__/data.json',
            'packages/x/src/index.ts',
            'src/Messages.loc.yaml',
            'src/a.ts',
            'src/b/c.ts',
        ]);
    });

    it('prunes what the predicate ignores, files and directories alike', async () => {
        const seen: string[] = [];
        const files = await walkProjectFiles(root, relativePath => {
            seen.push(relativePath);
            return relativePath === 'packages' || relativePath.endsWith('.yaml');
        });

        expect(files).toEqual(['.gitignore', '.storybook/main.ts', 'keep.log', 'src/a.ts', 'src/b/c.ts']);
        expect(seen.some(p => p.startsWith('packages/'))).toBe(false);
    });

    it('honours the ancestors’ .gitignore when walking a subdirectory', async () => {
        expect(await walkProjectFiles(path.join(root, 'packages/x'))).toEqual([
            '.gitignore',
            '__fixtures__/data.json',
            'src/index.ts',
        ]);
    });

    it('returns [] for a missing root', async () => {
        expect(await walkProjectFiles(path.join(root, 'does-not-exist'))).toEqual([]);
    });
});
