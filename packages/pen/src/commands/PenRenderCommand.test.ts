import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

const FIXTURE_CLI = new URL('./__fixtures__/penCli.ts', import.meta.url).pathname;
const FAKE_PEN = new URL('./__fixtures__/fakePen.ts', import.meta.url).pathname;
const FIXTURE_PEN = new URL('../__fixtures__/document.pen', import.meta.url).pathname;

test('renders the nodes of a revision and prints the PNGs written', async () => {
    const project = await createProject(`#!/bin/sh\nexec "${process.execPath}" "${FAKE_PEN}" "$@"\n`);
    await git(project, 'init', '--quiet');
    await git(project, 'add', 'design.pen');
    await git(project, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'base');
    await fs.writeFile(path.join(project, 'design.pen'), 'not a pen file any more');
    const out = path.join(project, 'renders');
    // A quote and a backslash would break out of a snippet built by hand.
    const odd = 'say "hi" \\';

    const result = await runPenRender(project, 'HEAD:design.pen', 'screen', odd, '--out', 'renders');

    expect(result).toEqual({
        exitCode: 0,
        stdout: `${path.join(out, `${odd}.png`)}\n${path.join(out, 'screen.png')}\n`,
        stderr: '',
    });
});

test('asks for `pen login` when pen answers that authentication is required', async () => {
    const project = await createProject(
        '#!/bin/sh\necho \'[ERROR] Authentication required. Run "pen login" or set PEN_CLI_KEY environment variable.\' >&2\nexit 1\n',
    );

    const result = await runPenRender(project, 'design.pen', 'screen');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEndWith(
        'pen render: run `pen login` once on this machine (the owner has to: it needs their pen.dev account)\n',
    );
    expect(result.stdout).toBe('');
});

test('fails naming the dev dependency when the repo has no pen CLI', async () => {
    const project = await createProject(null);

    const result = await runPenRender(project, 'design.pen', 'screen');

    expect(result).toEqual({
        exitCode: 1,
        stdout: '',
        stderr: 'pen render: the `pen` CLI is not installed: add `@pen.dev/cli` as a dev dependency\n',
    });
});

/** A project holding the fixture as `design.pen` and, unless null, this script as its `pen` binary. */
async function createProject(penScript: string | null) {
    const project = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pen-render-test-')));
    await fs.writeFile(path.join(project, 'package.json'), '{ "name": "project" }');
    await fs.copyFile(FIXTURE_PEN, path.join(project, 'design.pen'));

    if (penScript !== null) {
        const bin = path.join(project, 'node_modules', '.bin');
        await fs.mkdir(bin, { recursive: true });
        await fs.writeFile(path.join(bin, 'pen'), penScript, { mode: 0o755 });
    }

    return project;
}

async function git(cwd: string, ...args: string[]) {
    const child = Bun.spawn(['git', ...args], { cwd, stdout: 'ignore', stderr: 'inherit' });
    expect(await child.exited).toBe(0);
}

async function runPenRender(cwd: string, ...args: string[]) {
    const child = Bun.spawn([process.execPath, '--conditions=source', FIXTURE_CLI, 'pen', 'render', ...args], {
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
