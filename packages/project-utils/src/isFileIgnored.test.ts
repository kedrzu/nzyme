import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { clearIgnoreCache, isFileIgnored } from './isFileIgnored.js';

const files: Record<string, string> = {
    '.gitignore': ['*.log', '!keep.log', 'build/', '!build/keep.txt', '/rooted.txt', '!*.enc', '*.enc', ''].join('\n'),
    'a.log': '',
    'keep.log': '',
    'last.enc': '',
    'rooted.txt': '',
    'sub/rooted.txt': '',
    'build/out.js': '',
    'build/keep.txt': '',
    'src/build': '', // a file named build: `build/` only matches directories
    'sub/.gitignore': '!a.log\n/local.txt\n',
    'sub/a.log': '',
    'sub/b.log': '',
    'sub/local.txt': '',
    'sub/deep/local.txt': '',
    'plain.txt': '',
};

let root: string;

function gitIgnores(relative: string): boolean {
    return spawnSync('git', ['check-ignore', '-q', relative], { cwd: root }).status === 0;
}

beforeAll(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'is-file-ignored-')));
    spawnSync('git', ['init', '-q'], { cwd: root });
    for (const [name, content] of Object.entries(files)) {
        fs.outputFileSync(path.join(root, name), content);
    }
    clearIgnoreCache();
});

afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    clearIgnoreCache();
});

describe('isFileIgnored', () => {
    const cases: Array<[string, string]> = [
        ['negation in the same file re-includes', 'keep.log'],
        ['a positive pattern still ignores', 'a.log'],
        ['last matching pattern wins (ignore after negation)', 'last.enc'],
        ['negation in a nested .gitignore overrides the parent', 'sub/a.log'],
        ['nested file without negation stays ignored by the parent', 'sub/b.log'],
        ['file under an excluded directory stays excluded despite negation', 'build/keep.txt'],
        ['file under a directory pattern with trailing slash', 'build/out.js'],
        ['directory pattern does not match a file of the same name', 'src/build'],
        ['directory itself matched by a trailing slash pattern', 'build'],
        ['anchored pattern matches at the root', 'rooted.txt'],
        ['anchored pattern does not match deeper', 'sub/rooted.txt'],
        ['nested anchored pattern', 'sub/local.txt'],
        ['nested anchored pattern does not match deeper', 'sub/deep/local.txt'],
        ['not mentioned at all', 'plain.txt'],
    ];

    it.each(cases)('agrees with git check-ignore: %s', (_name, relative) => {
        const ignored = isFileIgnored(path.join(root, relative)) === true;
        expect(ignored).toBe(gitIgnores(relative));
    });

    it('pins the expected verdicts so agreement is not two wrong answers', () => {
        const verdict = (relative: string) => isFileIgnored(path.join(root, relative));
        expect(verdict('keep.log')).toBe(false);
        expect(verdict('a.log')).toBe(true);
        expect(verdict('sub/a.log')).toBe(false);
        expect(verdict('build/keep.txt')).toBe(true);
    });

    it('keeps the tri-state contract for non-ignored paths', () => {
        expect(isFileIgnored(path.join(root, 'plain.txt'))).toBe(false);
        expect(isFileIgnored(path.join(root, 'sub'))).toBeUndefined();
    });
});
