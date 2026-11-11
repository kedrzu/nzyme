import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { checkPen } from '../checkPen.js';
import type { PenDocument, PenNode } from '../PenDocument.js';
import { indexPen, parsePen, serializePen } from '../PenDocument.js';

const NZYME_CLI = new URL('../../../cli/src/cli.ts', import.meta.url).pathname;
const PEN_PLUGIN = new URL('../plugin.ts', import.meta.url).pathname;
const FIXTURE_PEN = await fs.readFile(new URL('../__fixtures__/document.pen', import.meta.url), 'utf8');

/** Nested, so the report's name shows how a path is flattened. */
const FILE = 'design/app.pen';
const REPORT = path.join('.git', 'pen-conflicts', 'design__app.pen.md');

test('git merges changes each branch made to different properties cleanly, adjacent lines included', async () => {
    // A line-based merge would conflict: the two properties are adjacent lines of the file.
    const repo = await createRepo({
        ours: doc => (node(doc, 'price').content = '$10 off'),
        theirs: doc => {
            node(doc, 'price').fontFamily = 'Mono';
            node(doc, 'button').cornerRadius = 8;
        },
    });

    const merge = await run(repo, 'git', 'merge', '--no-edit', 'theirs');

    expect(merge.exitCode).toBe(0);
    expect(await run(repo, 'git', 'ls-files', '-u')).toMatchObject({ stdout: '' });
    const merged = await readMerged(repo);
    expect(node(merged, 'price')).toMatchObject({ content: '$10 off', fontFamily: 'Mono' });
    expect(node(merged, 'button').cornerRadius).toBe(8);
    expect(await exists(path.join(repo, REPORT))).toBe(false);
});

test('a property both branches changed stops the merge with a valid file and a report in the git dir', async () => {
    const repo = await createRepo({
        ours: doc => (node(doc, 'row').name = 'Row (ours)'),
        theirs: doc => (node(doc, 'row').name = 'Row (theirs)'),
    });

    const merge = await run(repo, 'git', 'merge', '--no-edit', 'theirs');

    expect(merge.exitCode).toBe(1);
    expect(merge.stderr).toContain(`pen merge: 1 conflict(s) in ${FILE}, ours kept at each; report: `);
    expect(await unmergedStages(repo)).toEqual(['1', '2', '3']);
    expect(await run(repo, 'git', 'status', '--porcelain', '--untracked-files=all')).toMatchObject({
        stdout: `UU ${FILE}\n`,
    });
    expect(node(await readMerged(repo), 'row').name).toBe('Row (ours)');

    const report = await fs.readFile(path.join(repo, REPORT), 'utf8');
    expect(report).toContain('## 1. property');
    expect(report).toContain('- Node: `row` "Row (ours)" on "Screen · Inbox" (`screen`)');
    expect(report).toContain(
        '- Key: `name`\n- Base: `"Row"`\n- Ours (kept): `"Row (ours)"`\n- Theirs: `"Row (theirs)"`',
    );
});

test('a node one branch deleted and the other edited stops the merge, keeping the edited node', async () => {
    const repo = await createRepo({
        ours: doc => remove(doc, 'row'),
        theirs: doc => (node(doc, 'price').content = '$7 off'),
    });

    const merge = await run(repo, 'git', 'merge', '--no-edit', 'theirs');

    expect(merge.exitCode).toBe(1);
    expect(await unmergedStages(repo)).toEqual(['1', '2', '3']);
    expect(node(await readMerged(repo), 'price').content).toBe('$7 off');
    const report = await fs.readFile(path.join(repo, REPORT), 'utf8');
    expect(report).toContain('## 1. delete-edit\n\n- Node: `row` "Row" on "Screen · Inbox" (`screen`)\n- Ours deleted');
});

test('an unparsable side fails the driver and leaves ours untouched', async () => {
    const repo = await createRepo({
        ours: doc => (node(doc, 'row').name = 'Row (ours)'),
        theirs: '{ "version": ',
    });
    const oursText = await fs.readFile(path.join(repo, FILE), 'utf8');

    const merge = await run(repo, 'git', 'merge', '--no-edit', 'theirs');

    expect(merge.exitCode).toBe(1);
    expect(merge.stderr).toContain(`pen merge: cannot merge ${FILE}, ours left as it was: `);
    expect(await unmergedStages(repo)).toEqual(['1', '2', '3']);
    expect(await fs.readFile(path.join(repo, FILE), 'utf8')).toBe(oursText);
    expect(await exists(path.join(repo, REPORT))).toBe(false);
});

/** Changes the fixture in place, or is the text to commit instead. */
type Change = ((doc: PenDocument) => void) | string;

/** Options of {@link createRepo}. */
interface CreateRepoOptions {
    ours: Change;
    theirs: Change;
}

/**
 * A repo with the driver registered and the fixture committed, then changed on `main` (ours, left
 * checked out) and on the branch `theirs`.
 */
async function createRepo(options: CreateRepoOptions) {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'pen-merge-'));
    const driver = `${process.execPath} --conditions=source ${NZYME_CLI} pen merge %O %A %B %P`;

    await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify({ nzyme: { plugins: ['./pen.ts'] } }));
    await fs.writeFile(path.join(repo, 'pen.ts'), `export { default } from '${PEN_PLUGIN}';\n`);
    await fs.writeFile(path.join(repo, '.gitattributes'), '*.pen merge=pen -diff\n');
    await fs.mkdir(path.join(repo, 'design'));
    await fs.writeFile(path.join(repo, FILE), FIXTURE_PEN);

    await git(repo, 'init', '--quiet', '--initial-branch=main');
    await git(repo, 'config', 'user.name', 'Test');
    await git(repo, 'config', 'user.email', 'test@example.com');
    await git(repo, 'config', 'commit.gpgsign', 'false');
    await git(repo, 'config', 'merge.pen.driver', driver);
    await commit(repo, 'base');

    await git(repo, 'checkout', '--quiet', '-b', 'theirs');
    await commitChange(repo, options.theirs);
    await git(repo, 'checkout', '--quiet', 'main');
    await commitChange(repo, options.ours);

    return repo;
}

async function commitChange(repo: string, change: Change) {
    const doc = parsePen(FIXTURE_PEN);
    if (typeof change !== 'string') {
        change(doc);
    }
    await fs.writeFile(path.join(repo, FILE), typeof change === 'string' ? change : serializePen(doc));
    await commit(repo, 'change');
}

async function commit(repo: string, message: string) {
    await git(repo, 'add', '-A');
    await git(repo, 'commit', '--quiet', '-m', message);
}

/** Reads the merged file, checking it is a sound document without conflict markers. */
async function readMerged(repo: string) {
    const text = await fs.readFile(path.join(repo, FILE), 'utf8');
    expect(checkPen(text)).toEqual([]);
    return parsePen(text);
}

async function unmergedStages(repo: string) {
    const { stdout } = await run(repo, 'git', 'ls-files', '-u', '--', FILE);
    return stdout
        .trim()
        .split('\n')
        .map(line => line.split(/\s+/)[2]);
}

function node(doc: PenDocument, id: string): PenNode {
    const entry = indexPen(doc).get(id);
    if (!entry) {
        throw new Error(`no node ${id}`);
    }
    return entry.node;
}

function remove(doc: PenDocument, id: string) {
    const parentId = indexPen(doc).get(id)?.parentId;
    const siblings = parentId ? (node(doc, parentId).children ?? []) : doc.children;
    siblings.splice(
        siblings.findIndex(child => child.id === id),
        1,
    );
}

async function exists(file: string) {
    return fs.access(file).then(
        () => true,
        () => false,
    );
}

async function git(cwd: string, ...args: string[]) {
    const result = await run(cwd, 'git', ...args);
    expect(result).toMatchObject({ exitCode: 0 });
}

async function run(cwd: string, ...command: string[]) {
    const child = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);

    return { exitCode, stdout, stderr };
}
