import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { PenDocument, PenNode } from '../PenDocument.js';
import { indexPen, parsePen, serializePen } from '../PenDocument.js';

const FIXTURE_CLI = new URL('./__fixtures__/penCli.ts', import.meta.url).pathname;
const FIXTURE_PEN = await fs.readFile(new URL('../__fixtures__/document.pen', import.meta.url), 'utf8');

test('diffs the working file against a revision, finding the only tracked .pen file', async () => {
    const repo = await createRepo();
    await commitChange(repo, doc => (node(doc, 'button').cornerRadius = 8));
    await writeChange(repo, doc => {
        node(doc, 'button').cornerRadius = 8;
        node(doc, 'price').content = '$10 off';
        node(doc, 'row').children?.push({
            type: 'frame',
            id: 'badge',
            name: 'Badge',
            children: [{ type: 'text', id: 'badgeText', content: 'New' }],
        });
        doc.variables = { ...doc.variables, bg: { type: 'color', value: '#000000' } };
    });

    const result = await runPenDiff(repo, 'HEAD~1');

    expect(result).toEqual({
        exitCode: 0,
        stderr: '',
        stdout: [
            '# `design/app.pen`: HEAD~1 → working tree',
            '',
            '2 added, 0 removed, 2 changed, 0 moved node(s) in 2 frame(s); 1 variable(s) and 1 component(s) changed.',
            '',
            '## "Screen · Inbox" (`screen`)',
            '',
            '- added `badge` "Badge" (frame, +1 inside)',
            '- changed `price` "$ label" (text): `content`',
            '',
            '## "Components" (`components`)',
            '',
            '- changed `button` "Button" (frame): `cornerRadius`',
            '',
            '## Variables',
            '',
            '- changed `bg`: `{"type":"color","value":"#0D1117"}` → `{"type":"color","value":"#000000"}`',
            '',
            '## Components',
            '',
            'A change to a component reaches every instance of it.',
            '',
            '- changed `button` "Button" (frame) on "Components" (`components`): 2 instance(s)',
            '',
        ].join('\n'),
    });
});

test('diffs two revisions of the path after `--`, leaving the working file out', async () => {
    const repo = await createRepo();
    await commitChange(repo, doc => (node(doc, 'row').name = 'Row (renamed)'));
    await writeChange(repo, doc => (node(doc, 'price').content = 'uncommitted'));

    const result = await runPenDiff(repo, 'HEAD~1', 'HEAD', '--', 'design/app.pen');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('- changed `row` "Row (renamed)" (frame): `name`\n');
    expect(result.stdout).not.toContain('`price`');
});

/** A repo with the fixture committed as `design/app.pen`. */
async function createRepo() {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'pen-diff-'));
    await fs.mkdir(path.join(repo, 'design'));
    await fs.writeFile(path.join(repo, 'design', 'app.pen'), FIXTURE_PEN);
    await git(repo, 'init', '--quiet');
    await git(repo, 'add', '-A');
    await commit(repo);
    return repo;
}

async function commitChange(repo: string, change: (doc: PenDocument) => void) {
    await writeChange(repo, change);
    await git(repo, 'add', '-A');
    await commit(repo);
}

/** Writes the fixture with the change applied as the working file. */
async function writeChange(repo: string, change: (doc: PenDocument) => void) {
    const doc = parsePen(FIXTURE_PEN);
    change(doc);
    await fs.writeFile(path.join(repo, 'design', 'app.pen'), serializePen(doc));
}

async function commit(repo: string) {
    await git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'change');
}

function node(doc: PenDocument, id: string): PenNode {
    const entry = indexPen(doc).get(id);
    if (!entry) {
        throw new Error(`no node ${id}`);
    }
    return entry.node;
}

async function git(cwd: string, ...args: string[]) {
    const child = Bun.spawn(['git', ...args], { cwd, stdout: 'ignore', stderr: 'inherit' });
    expect(await child.exited).toBe(0);
}

async function runPenDiff(cwd: string, ...args: string[]) {
    const child = Bun.spawn([process.execPath, '--conditions=source', FIXTURE_CLI, 'pen', 'diff', ...args], {
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
