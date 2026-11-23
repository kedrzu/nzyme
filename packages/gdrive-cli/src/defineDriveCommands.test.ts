import fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';

import { afterEach, expect, spyOn, test } from 'bun:test';

import type { GoogleCommandResult } from '@nzyme/google-auth/__fixtures__/googleTestCli.js';
import {
    CLIENT_KEYS,
    CREDENTIALS,
    runCommands,
    testAuthOptions,
    tokensValue,
} from '@nzyme/google-auth/__fixtures__/googleTestCli.js';
import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

import type { FakeDriveFile, FakeDriveOptions } from './__fixtures__/fakeDrive.js';
import { startFakeDrive } from './__fixtures__/fakeDrive.js';
import { defineDriveCommands } from './defineDriveCommands.js';
import { DOCUMENT, FOLDER, SPREADSHEET } from './formats.js';
import type { DrivePermissions } from './permissions.js';

const EMAIL = 'me@example.com';
const TOKENS = defineSecret('DRIVE_TOKENS');
const ALL_ON: DrivePermissions = { browse: true, download: true, upload: true, edit: true, delete: true };
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const DOC: FakeDriveFile = {
    id: 'doc1',
    name: 'Plan',
    mimeType: DOCUMENT,
    parents: ['folder1'],
    exports: { 'text/markdown': '# Plan\n\nShip it.\n', [DOCX]: 'docx-bytes' },
};
const SHEET: FakeDriveFile = {
    id: 'sheet1',
    name: 'Budget',
    mimeType: SPREADSHEET,
    parents: ['folder1'],
    exports: { 'text/csv': 'month,amount\nMay,12\n' },
};
const FOLDER_FILE: FakeDriveFile = { id: 'folder1', name: 'Projects', mimeType: FOLDER, parents: ['root'] };
const PDF: FakeDriveFile = {
    id: 'pdf1',
    name: 'Invoice.pdf',
    mimeType: 'application/pdf',
    parents: ['root'],
    content: '%PDF',
};

const fakes: ReturnType<typeof startFakeDrive>[] = [];
const tmpDirs: string[] = [];

afterEach(async () => {
    const stopped = fakes.splice(0);
    await Promise.all(stopped.map(drive => drive.stop()));
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
    // No command, in any test, may delete permanently, empty the trash or touch sharing.
    expect(stopped.flatMap(drive => drive.violations)).toEqual([]);
});

test('--help lists only the browse and download commands by default', async () => {
    const drive = fake({});

    const result = await run(drive, ['--help']);

    expect(listedCommands(result)).toEqual(['accounts', 'auth', 'download', 'drives', 'info', 'ls', 'read', 'search']);
});

test('--help lists every Drive command with every permission on', async () => {
    const drive = fake({});

    const result = await run(drive, ['--help'], { permissions: ALL_ON });

    expect(listedCommands(result)).toEqual([
        'accounts',
        'auth',
        'download',
        'drives',
        'info',
        'ls',
        'meta',
        'mkdir',
        'read',
        'restore',
        'search',
        'trash',
        'update',
        'upload',
    ]);
});

test.each([
    ['upload', ['mkdir', 'upload']],
    ['edit', ['meta', 'update']],
    ['delete', ['restore', 'trash']],
] as const)('--help with only %p on lists its commands and no other write command', async (permission, added) => {
    const drive = fake({});

    const result = await run(drive, ['--help'], { permissions: { [permission]: true } });

    const readOnly = ['accounts', 'auth', 'download', 'drives', 'info', 'ls', 'read', 'search'];
    expect(listedCommands(result)).toEqual([...readOnly, ...added].toSorted());
});

test.each([
    [['upload', '--name', 'a.txt'], {}],
    [['mkdir', 'New'], {}],
    [['update', 'doc1'], {}],
    [['meta', 'doc1', '--star'], {}],
    [['trash', 'doc1'], {}],
    [['restore', 'doc1'], {}],
    [['search', 'plan'], { browse: false }],
    [['read', 'doc1'], { download: false }],
])('drive %p is unknown when its permission is off', async (args, permissions) => {
    const drive = fake({ files: [DOC] });

    const result = await run(drive, ['drive', ...args], { permissions, stdin: 'x' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Command not found');
    expect(drive.requests).toEqual([]);
    expect(drive.grants).toEqual([]);
});

test('search treats plain words as full text and syntax as a query, one line per file', async () => {
    const drive = fake({ files: [DOC, SHEET], nextPageToken: 'page-2' });

    const words = await run(drive, ['drive', 'search', 'ship it']);
    const syntax = await run(drive, ['drive', 'search', "name contains 'Plan'", '--type', 'doc']);

    expect(words.exitCode).toBe(0);
    expect(words.stdout).toBe(
        'doc1\tGoogle Doc\t2026-11-20T10:00:00.000Z\tPlan\n' +
            'sheet1\tGoogle Sheet\t2026-11-20T10:00:00.000Z\tBudget\n' +
            'nextPageToken: page-2\n',
    );
    const listings = drive.requests.filter(request => request.path === '/files');
    expect(listings.map(request => [request.query.get('q'), request.query.get('orderBy')])).toEqual([
        ["fullText contains 'ship it' and trashed = false", null],
        [`(name contains 'Plan') and mimeType = '${DOCUMENT}' and trashed = false`, 'modifiedTime desc'],
    ]);
    expect(listings.every(request => request.query.get('supportsAllDrives') === 'true')).toBe(true);
    expect(syntax.exitCode).toBe(0);
    expectNoCredential(words);
});

test('ls lists a folder given by URL, folders first', async () => {
    const drive = fake({ files: [FOLDER_FILE, DOC, SHEET] });

    const result = await run(drive, ['drive', 'ls', 'https://drive.google.com/drive/folders/folder1']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.split('\n')[0]).toBe('doc1\tGoogle Doc\t2026-11-20T10:00:00.000Z\tPlan');
    const [listing] = drive.requests;
    expect(listing?.query.get('q')).toBe("'folder1' in parents and trashed = false");
    expect(listing?.query.get('orderBy')).toBe('folder, name');
});

test('read prints a Doc as Markdown and a Sheet as CSV through the export endpoint', async () => {
    const drive = fake({ files: [DOC, SHEET] });

    const doc = await run(drive, ['drive', 'read', 'https://docs.google.com/document/d/doc1/edit']);
    const sheet = await run(drive, ['drive', 'read', 'sheet1']);

    expect(doc.exitCode).toBe(0);
    expect(doc.stdout).toBe(
        'id: doc1\nname: Plan\ntype: Google Doc\nmodified: 2026-11-20T10:00:00.000Z\nchars: 17\n\n# Plan\n\nShip it.\n',
    );
    expect(sheet.stdout).toBe(
        'id: sheet1\nname: Budget\ntype: Google Sheet\nmodified: 2026-11-20T10:00:00.000Z\nchars: 20\n' +
            'note: CSV export holds only the first sheet - download as xlsx for every sheet\n\n' +
            'month,amount\nMay,12\n',
    );
    const exports = drive.requests.filter(request => request.path.endsWith('/export'));
    expect(exports.map(request => `${request.path} ${request.query.get('mimeType')}`)).toEqual([
        '/files/doc1/export text/markdown',
        '/files/sheet1/export text/csv',
    ]);
    expectNoCredential(doc);
});

test('read refuses a binary file and points at download', async () => {
    const drive = fake({ files: [PDF] });

    const result = await run(drive, ['drive', 'read', 'pdf1']);

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('save it with `nzyme drive download pdf1`');
    expect(drive.requests.filter(request => request.query.get('alt') === 'media')).toEqual([]);
});

test('download saves an export under the downloads directory or --to, and never replaces a file unasked', async () => {
    const home = await tempDir();
    const elsewhere = await tempDir();
    const drive = fake({ files: [DOC, PDF] });

    const homedir = spyOn(os, 'homedir').mockReturnValue(home);
    const saved = await run(drive, ['drive', 'download', 'doc1']);
    const pdf = await run(drive, ['drive', 'download', 'pdf1', '--to', `${elsewhere}/invoices/`]);
    const again = await run(drive, ['drive', 'download', 'doc1']);
    homedir.mockRestore();

    const docPath = path.join(home, '.cache', 'gdrive-cli', 'downloads', 'Plan.docx');
    expect(saved.exitCode).toBe(0);
    expect(saved.stdout).toBe(`Downloaded doc1: ${docPath} (${DOCX}, 10 B)\n`);
    expect(await fs.readFile(docPath, 'utf8')).toBe('docx-bytes');
    expect(pdf.exitCode).toBe(0);
    expect(await fs.readFile(path.join(elsewhere, 'invoices', 'Invoice.pdf'), 'utf8')).toBe('%PDF');
    expect(again.exitCode).toBe(1);
    expect(again.errors).toContain('already exists - pass --overwrite');
    expectNoCredential(saved);
});

test('upload sends a local file and converts stdin Markdown into a Doc', async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, 'report.csv'), 'a,b\n1,2\n');
    const drive = fake({ files: [FOLDER_FILE, { ...DOC, name: 'Notes', parents: ['folder1'] }] });
    const options = { permissions: ALL_ON };

    const file = await run(drive, ['drive', 'upload', '--file', path.join(root, 'report.csv')], options);
    const converted = await run(
        drive,
        ['drive', 'upload', '--name', 'Notes.md', '--convert', '--folder', 'folder1', '--description', 'Weekly'],
        { ...options, stdin: '# Notes\n' },
    );

    expect(file.exitCode).toBe(0);
    expect(file.stdout).toBe('Uploaded new-1 "report.csv" (text/csv)\n');
    expect(converted.exitCode).toBe(0);
    expect(converted.stdout).toBe(
        'Uploaded new-2 "Notes" (Google Doc)\n' +
            "note: the folder now holds 2 files named 'Notes' - `nzyme drive update` replaces contents instead of adding a copy\n",
    );
    const uploads = drive.requests.filter(request => request.upload).map(request => request.upload);
    expect(uploads).toEqual([
        { metadata: { name: 'report.csv' }, mimeType: 'text/csv', content: 'a,b\n1,2\n' },
        {
            metadata: { name: 'Notes', parents: ['folder1'], mimeType: DOCUMENT, description: 'Weekly' },
            mimeType: 'text/markdown',
            content: '# Notes\n',
        },
    ]);
    expectNoCredential(converted);
});

test('update replaces a Doc from stdin Markdown and refuses contents the type cannot take', async () => {
    const drive = fake({ files: [DOC, SHEET] });

    const doc = await run(drive, ['drive', 'update', 'doc1'], { permissions: ALL_ON, stdin: '# Plan v2\n' });
    const sheet = await run(drive, ['drive', 'update', 'sheet1', '--content-type', 'text/markdown'], {
        permissions: ALL_ON,
        stdin: '# Not a table\n',
    });

    expect(doc.exitCode).toBe(0);
    expect(doc.stdout).toBe('Replaced the contents of doc1 "Plan" (Google Doc), now version 2\n');
    expect(drive.requests.find(request => request.method === 'PATCH')?.upload).toEqual({
        mimeType: 'text/markdown',
        content: '# Plan v2\n',
    });
    expect(sheet.exitCode).toBe(1);
    expect(sheet.errors).toContain('A Google Sheet cannot take text/markdown contents.');
    expect(drive.requests.filter(request => request.method === 'PATCH')).toHaveLength(1);
});

test('meta renames, stars and moves a file out of every other folder', async () => {
    const drive = fake({ files: [{ ...DOC, parents: ['folder1', 'folder2'] }] });

    const result = await run(drive, ['drive', 'meta', 'doc1', '--name', 'Plan v2', '--star', '--move-to', 'folder3'], {
        permissions: ALL_ON,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Updated doc1 "Plan v2" (Google Doc)\n');
    const update = drive.requests.find(request => request.method === 'PATCH');
    expect(update?.body).toEqual({ name: 'Plan v2', starred: true });
    expect(update?.query.get('addParents')).toBe('folder3');
    expect(update?.query.get('removeParents')).toBe('folder1,folder2');
});

test('trash and restore set trashed through a metadata update, never deleting', async () => {
    const drive = fake({ files: [DOC] });

    const trashed = await run(drive, ['drive', 'trash', 'doc1'], { permissions: { delete: true } });
    const restored = await run(drive, ['drive', 'restore', 'doc1'], { permissions: { delete: true } });

    expect(trashed.exitCode).toBe(0);
    expect(restored.exitCode).toBe(0);
    expect(restored.stdout).toBe('Restored from the trash: doc1 "Plan" (Google Doc)\n');
    expect(
        drive.requests
            .filter(request => request.method !== 'GET')
            .map(request => [request.method, request.path, request.body, request.query.get('supportsAllDrives')]),
    ).toEqual([
        ['PATCH', '/files/doc1', { trashed: true }, 'true'],
        ['PATCH', '/files/doc1', { trashed: false }, 'true'],
    ]);
});

test('mkdir creates a folder in the parent', async () => {
    const drive = fake({});

    const result = await run(drive, ['drive', 'mkdir', 'Invoices', '--parent', 'folder1'], { permissions: ALL_ON });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Created folder new-1 "Invoices" (folder)\n');
    expect(drive.requests.find(request => request.method === 'POST')?.body).toEqual({
        name: 'Invoices',
        mimeType: FOLDER,
        parents: ['folder1'],
    });
});

test.each([[['search', 'plan']], [['read', 'doc1']], [['upload', '--name', 'a.txt']], [['trash', 'doc1']]])(
    'drive %p as an account outside the allowed ones is refused by name before any call',
    async args => {
        const drive = fake({ files: [DOC] });

        const result = await run(drive, ['drive', ...args, '--account', 'eve@example.com'], {
            permissions: ALL_ON,
            stdin: 'x',
        });

        expect(result.exitCode).toBe(1);
        expect(result.errors).toContain('eve@example.com has no DRIVE token');
        expect(drive.requests).toEqual([]);
    },
);

interface RunOptions {
    permissions?: Partial<DrivePermissions>;
    stdin?: string;
}

function fake(options: Omit<FakeDriveOptions, 'email'>) {
    const drive = startFakeDrive({ email: EMAIL, ...options });
    fakes.push(drive);
    return drive;
}

function run(drive: ReturnType<typeof startFakeDrive>, args: string[], options: RunOptions = {}) {
    const store = createMemoryStore({
        id: 'only',
        data: { ...CLIENT_KEYS, [TOKENS.name]: tokensValue(EMAIL) },
    });
    const commands = defineDriveCommands({
        auth: testAuthOptions({
            stores: [store.store],
            secrets: [TOKENS],
            tokens: TOKENS,
            accounts: ['*@example.com'],
        }),
        permissions: options.permissions,
    });

    return runCommands({ commands, args, endpoints: drive.endpoints, stdin: options.stdin });
}

function listedCommands(result: GoogleCommandResult) {
    return [...result.stdout.matchAll(/^\s+nzyme drive ([a-z]+)\b/gm)].map(match => match[1]).toSorted();
}

async function tempDir() {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gdrive-cli-test-')));
    tmpDirs.push(dir);
    return dir;
}

function expectNoCredential(result: GoogleCommandResult) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const credential of CREDENTIALS) {
        expect(output).not.toContain(credential);
    }
}
