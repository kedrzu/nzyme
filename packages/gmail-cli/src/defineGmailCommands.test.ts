import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import type { GoogleCommandResult } from '@nzyme/google-auth/__fixtures__/googleTestCli.js';
import {
    CLIENT_ID,
    CLIENT_SECRET,
    createTestProvider,
    CREDENTIALS,
    runCommands,
    tokenValue,
} from '@nzyme/google-auth/__fixtures__/googleTestCli.js';
import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';

import type { FakeGmailMessage, FakeGmailOptions } from './__fixtures__/fakeGmail.js';
import { startFakeGmail } from './__fixtures__/fakeGmail.js';
import { defineGmailCommands } from './defineGmailCommands.js';
import type { GmailFilesOptions } from './GmailCommandsOptions.js';

const EMAIL = 'me@example.com';
const VIEWS = { inbox: 'in:inbox -label:Done', waiting: 'label:Waiting' };
const LABELS = [
    { id: 'INBOX', name: 'INBOX', type: 'system' },
    { id: 'Label_7', name: 'Clients/Acme', type: 'user' },
];

const fakes: ReturnType<typeof startFakeGmail>[] = [];
const tmpDirs: string[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(gmail => gmail.stop()));
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

test('--help lists every Gmail command', async () => {
    const gmail = fake({});

    const result = await run(gmail, ['--help']);

    const listed = [...result.stdout.matchAll(/^\s+nzyme gmail ([a-z]+(?: [a-z]+)?)\b/gm)].map(match => match[1]);
    expect(listed.toSorted()).toEqual([
        'accounts',
        'attachment save',
        'auth',
        'labels list',
        'message',
        'search',
        'thread',
    ]);
});

test('search ANDs the view with the query and lists threads newest first, one line each', async () => {
    const gmail = fake({
        messages: [
            message({ id: 'm1', threadId: 't1', subject: 'Invoice\tMarch', date: 'Mon, 2 Nov 2026 10:00:00 +0100' }),
            message({ id: 'm2', threadId: 't2', subject: 'Lunch?', date: 'Tue, 3 Nov 2026 12:00:00 +0100' }),
            message({ id: 'm3', threadId: 't1', subject: 'Re: Invoice', date: 'Wed, 4 Nov 2026 09:00:00 +0100' }),
        ],
    });

    const withView = await run(gmail, ['gmail', 'search', 'from:jan', '--view', 'inbox']);
    const withoutView = await run(gmail, ['gmail', 'search', 'from:jan', '--limit', '1']);
    const viewOnly = await run(gmail, ['gmail', 'search', '--view', 'waiting']);

    expect(withView.exitCode).toBe(0);
    expect(searchQueries(gmail)).toEqual(['in:inbox -label:Done from:jan', 'from:jan', 'label:Waiting']);
    expect(withView.stdout).toBe(
        't1\tMon, 2 Nov 2026 10:00:00 +0100\tJan <jan@example.com>\tInvoice March\t(2)\n' +
            't2\tTue, 3 Nov 2026 12:00:00 +0100\tJan <jan@example.com>\tLunch?\t(1)\n',
    );
    expect(withoutView.stdout.split('\n')[0]?.split('\t')[0]).toBe('t1');
    expect(withoutView.stdout.split('\n')).toHaveLength(2);
    expect(viewOnly.exitCode).toBe(0);
    for (const result of [withView, withoutView, viewOnly]) {
        expectNoCredential(result);
    }
});

test.each([
    [['gmail', 'search', 'from:jan', '--view', 'later'], 'Views: inbox, waiting.'],
    [['gmail', 'search'], 'Pass a query or --view.'],
])('search %p is refused before any call to Gmail', async (args, reason) => {
    const gmail = fake({});

    const result = await run(gmail, args);

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(reason);
    expect(gmail.requests).toEqual([]);
    expect(gmail.grants).toEqual([]);
});

test('thread prints every message as Markdown under its headers, quotes and signatures stripped', async () => {
    const gmail = fake({
        messages: [
            message({
                id: 'm1',
                threadId: 't1',
                subject: 'Invoice',
                to: 'Me <me@example.com>',
                cc: 'Ann <ann@example.com>',
                labelIds: ['INBOX', 'Label_7'],
                html:
                    '<p>Here is the <strong>invoice</strong>.</p>' +
                    '<div class="gmail_quote">On Mon, Ann wrote:<br>old text</div>',
                attachments: [
                    { partId: '2', filename: 'invoice.pdf', mimeType: 'application/pdf', content: 'x'.repeat(2048) },
                ],
            }),
            message({
                id: 'm2',
                threadId: 't1',
                from: 'Me <me@example.com>',
                subject: 'Re: Invoice',
                text: 'Thanks, paid.\n\n-- \nMe\nSent from my phone\n\nOn Mon, Jan wrote:\n> Here is the invoice.',
            }),
        ],
    });

    const result = await run(gmail, ['gmail', 'thread', 't1']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
        [
            'id: m1',
            'thread: t1',
            'subject: Invoice',
            'from: Jan <jan@example.com>',
            'to: Me <me@example.com>',
            'cc: Ann <ann@example.com>',
            'date: Mon, 2 Nov 2026 10:00:00 +0100',
            'labels: INBOX, Clients/Acme',
            'attachment: 2 invoice.pdf application/pdf 2.0 KB',
            '',
            'Here is the **invoice**.',
            '',
            '---',
            '',
            'id: m2',
            'thread: t1',
            'subject: Re: Invoice',
            'from: Me <me@example.com>',
            'date: Mon, 2 Nov 2026 10:00:00 +0100',
            '',
            'Thanks, paid.',
            '',
        ].join('\n'),
    );
    expectNoCredential(result);
});

test('attachment save writes only under <attachmentsDir>/<messageId>, sanitising the file name', async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-cli-test-')));
    tmpDirs.push(root);
    const attachmentsDir = path.join(root, 'attachments');
    const gmail = fake({
        messages: [
            message({
                id: 'm1',
                threadId: 't1',
                text: 'See attached.',
                attachments: [
                    { partId: '2', filename: '../../escape.txt', mimeType: 'text/plain', content: 'hello' },
                    { partId: '3', filename: '..', mimeType: 'text/plain', content: 'dots' },
                ],
            }),
        ],
    });

    const saved = await run(gmail, ['gmail', 'attachment', 'save', 'm1', '2'], { attachmentsDir });
    const dots = await run(gmail, ['gmail', 'attachment', 'save', 'm1', '3'], { attachmentsDir });
    const traversal = await run(gmail, ['gmail', 'attachment', 'save', '../m1', '2'], { attachmentsDir });

    const savedPath = path.join(attachmentsDir, 'm1', '.._.._escape.txt');
    expect(saved.exitCode).toBe(0);
    expect(saved.stdout).toBe(`Saved part 2 of m1: ${savedPath} (text/plain, 5 B)\n`);
    expect(dots.exitCode).toBe(0);
    expect(traversal.exitCode).toBe(1);
    expect(traversal.errors).toContain("'../m1' is not a Gmail message id");
    expect((await fs.readdir(root, { recursive: true })).toSorted()).toEqual([
        'attachments',
        path.join('attachments', 'm1'),
        path.join('attachments', 'm1', '.._.._escape.txt'),
        path.join('attachments', 'm1', 'attachment'),
    ]);
    expect(await fs.readFile(savedPath, 'utf8')).toBe('hello');
    expectNoCredential(saved);
});

test('an account outside the allowed ones is refused by name before any call to Gmail', async () => {
    const gmail = fake({});

    const result = await run(gmail, ['gmail', 'labels', 'list', '--account', 'eve@example.com']);

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('eve@example.com has no GMAIL token');
    expect(gmail.requests).toEqual([]);
});

test('labels list prints one line per label, and a Gmail error carries no credential', async () => {
    const gmail = fake({});

    const labels = await run(gmail, ['gmail', 'labels', 'list']);
    const missing = await run(gmail, ['gmail', 'message', 'nope']);

    expect(labels.stdout).toBe('INBOX\tINBOX\tsystem\nLabel_7\tClients/Acme\tuser\n');
    expect(missing.exitCode).toBe(1);
    expect(missing.errors).toContain('Requested entity was not found.');
    expectNoCredential(labels);
    expectNoCredential(missing);
});

test('malformed options are refused when the commands are defined', () => {
    const provider = createTestProvider([]);

    expect(() => defineGmailCommands({ auth: { provider }, files: { attachmentsDir: 'relative/dir' } })).toThrow(
        "'relative/dir' must be absolute or start with ~",
    );
    expect(() =>
        defineGmailCommands({ auth: { provider }, labels: { views: {}, require: [{ when: 'X', group: 'nope' }] } }),
    ).toThrow('Invalid Gmail command options');
});

function fake(options: Omit<FakeGmailOptions, 'email'>) {
    const gmail = startFakeGmail({ email: EMAIL, labels: LABELS, ...options });
    fakes.push(gmail);
    return gmail;
}

function run(gmail: ReturnType<typeof startFakeGmail>, args: string[], files?: GmailFilesOptions) {
    const store = createMemoryStore({
        id: 'only',
        data: {
            GOOGLE_CLIENT_ID: CLIENT_ID,
            GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
            GOOGLE_GMAIL_TOKEN_ME_EXAMPLE_COM: tokenValue(EMAIL),
        },
    });
    const commands = defineGmailCommands({
        auth: { provider: createTestProvider([store.store]), accounts: ['*@example.com'] },
        labels: { views: VIEWS },
        files,
    });

    return runCommands({ commands, args, endpoints: gmail.endpoints });
}

function message(overrides: Partial<FakeGmailMessage> & Pick<FakeGmailMessage, 'id' | 'threadId'>): FakeGmailMessage {
    return {
        from: 'Jan <jan@example.com>',
        subject: 'Hello',
        date: 'Mon, 2 Nov 2026 10:00:00 +0100',
        ...overrides,
    };
}

function searchQueries(gmail: ReturnType<typeof startFakeGmail>) {
    return gmail.requests.filter(request => request.path === '/messages').map(request => request.query.get('q'));
}

function expectNoCredential(result: GoogleCommandResult) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const credential of CREDENTIALS) {
        expect(output).not.toContain(credential);
    }
}
