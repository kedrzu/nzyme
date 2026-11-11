import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

const FIXTURE_CLI = new URL('./__fixtures__/penCli.ts', import.meta.url).pathname;
const FIXTURE_PEN = new URL('../__fixtures__/document.pen', import.meta.url).pathname;

test('checks every tracked .pen file and fails naming the file and the node', async () => {
    const repo = await createRepo();
    const broken = (await fs.readFile(FIXTURE_PEN, 'utf8')).replace('"ref": "button"', '"ref": "nowhere"');
    await fs.mkdir(path.join(repo, 'design'));
    await fs.copyFile(FIXTURE_PEN, path.join(repo, 'good.pen'));
    await fs.writeFile(path.join(repo, 'design', 'broken.pen'), broken);
    await fs.writeFile(path.join(repo, 'untracked.pen'), '<<<<<<< ours');
    await git(repo, 'add', 'good.pen', 'design/broken.pen');

    const result = await runPenCheck(repo);

    expect(result).toEqual({
        exitCode: 1,
        stdout: '',
        stderr: 'design/broken.pen: node saveButton: instance of missing node "nowhere"\npen check: 1 error(s)\n',
    });
});

async function createRepo() {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'pen-check-'));
    await git(repo, 'init', '--quiet');
    return repo;
}

async function git(cwd: string, ...args: string[]) {
    const child = Bun.spawn(['git', ...args], { cwd, stdout: 'ignore', stderr: 'inherit' });
    expect(await child.exited).toBe(0);
}

async function runPenCheck(cwd: string) {
    const child = Bun.spawn([process.execPath, '--conditions=source', FIXTURE_CLI, 'pen', 'check'], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);

    return { exitCode, stdout, stderr };
}
