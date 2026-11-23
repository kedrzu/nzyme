import fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';

import { afterEach, expect, spyOn, test } from 'bun:test';

import type { GoogleCommandResult } from '@nzyme/google-auth/__fixtures__/googleTestCli.js';
import {
    ACCESS_TOKEN,
    CLIENT_KEYS,
    CREDENTIALS,
    runCommands,
    testAuthOptions,
    tokensValue,
} from '@nzyme/google-auth/__fixtures__/googleTestCli.js';
import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

import type { FakeGmailMessage, FakeGmailOptions } from './__fixtures__/fakeGmail.js';
import { startFakeGmail } from './__fixtures__/fakeGmail.js';
import { defineGmailCommands } from './defineGmailCommands.js';
import type { GmailLabelRules } from './labelRules.js';

const EMAIL = 'me@example.com';
const TOKENS = defineSecret('GMAIL_TOKENS');
const RULES: GmailLabelRules = {
    views: { inbox: 'in:inbox -label:Done', waiting: 'label:Waiting' },
    groups: { status: ['Todo', 'Waiting'] },
    archiveMarkers: ['Done'],
};
const LABELS = [
    { id: 'INBOX', name: 'INBOX', type: 'system' },
    { id: 'Label_7', name: 'Clients/Acme', type: 'user' },
];

const SEND_AS = [{ sendAsEmail: EMAIL, isDefault: true, signature: '<b>Me</b> at Acme' }];

const fakes: ReturnType<typeof startFakeGmail>[] = [];
const tmpDirs: string[] = [];

afterEach(async () => {
    const stopped = fakes.splice(0);
    await Promise.all(stopped.map(gmail => gmail.stop()));
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
    // No command, in any test, may send or permanently delete; trash and spam are allowed.
    expect(stopped.flatMap(gmail => gmail.violations)).toEqual([]);
});

test('--help lists every Gmail command', async () => {
    const gmail = fake({});

    const result = await run(gmail, ['--help']);

    const listed = [...result.stdout.matchAll(/^\s+nzyme gmail ([a-z]+(?: [a-z]+)?)\b/gm)].map(match => match[1]);
    expect(listed.toSorted()).toEqual([
        'accounts',
        'attachment save',
        'auth',
        'draft create',
        'draft discard',
        'draft get',
        'draft list',
        'draft update',
        'labels cleanup',
        'labels create',
        'labels list',
        'message',
        'search',
        'thread',
        'thread label',
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

test('attachment save writes only under the attachments directory, one folder per message, sanitising the file name', async () => {
    const root = await tempDir();
    const attachmentsDir = path.join(root, '.cache', 'gmail-cli', 'attachments');
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

    const homedir = spyOn(os, 'homedir').mockReturnValue(root);
    const saved = await run(gmail, ['gmail', 'attachment', 'save', 'm1', '2']);
    const dots = await run(gmail, ['gmail', 'attachment', 'save', 'm1', '3']);
    const traversal = await run(gmail, ['gmail', 'attachment', 'save', '../m1', '2']);
    homedir.mockRestore();

    const savedPath = path.join(attachmentsDir, 'm1', '__.._escape.txt');
    expect(saved.exitCode).toBe(0);
    expect(saved.stdout).toBe(`Saved part 2 of m1: ${savedPath} (text/plain, 5 B)\n`);
    expect(dots.exitCode).toBe(0);
    expect(traversal.exitCode).toBe(1);
    expect(traversal.errors).toContain("'../m1' is not a Gmail message id");
    expect((await fs.readdir(attachmentsDir, { recursive: true })).toSorted()).toEqual([
        'm1',
        path.join('m1', '_'),
        path.join('m1', '__.._escape.txt'),
    ]);
    expect(await fs.readFile(savedPath, 'utf8')).toBe('hello');
    expectNoCredential(saved);
});

test('draft create replies in a thread with the signature, the quote, an attachment and an inline image', async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, 'report.pdf'), 'pdf');
    await fs.writeFile(path.join(root, 'chart.png'), 'png');
    const gmail = fake({ messages: invoiceThread(), sendAs: SEND_AS });

    const result = await run(
        gmail,
        ['gmail', 'draft', 'create', '--thread', 't1', '--attach', path.join(root, 'report.pdf')],
        { stdin: `Here is the **report**.\n\n![chart](${path.join(root, 'chart.png')})\n` },
    );

    expect(result.errors).toBe('');
    expect(result.stdout).toBe(
        'Draft created: r-draft-1 (message r-message-1, thread t1) to Jan <jan@example.com>, subject "Re: Invoice", ' +
            'inline images: chart.png (image/png, 3 B), attachments: report.pdf (application/pdf, 3 B)\n',
    );
    expect(takeCalls(gmail)).toEqual(['GET /settings/sendAs', 'GET /threads/t1', 'POST /upload/drafts']);
    const [upload] = gmail.uploads;
    expect(upload?.metadata).toEqual({ message: { threadId: 't1' } });
    const mime = unfold(upload?.message);
    expect(mime).toMatch(/^To: Jan <jan@example.com>$/m);
    expect(mime).toMatch(/^Subject: Re: Invoice$/m);
    expect(mime).toMatch(/^In-Reply-To: <m1@example.com>$/m);
    expect(mime).toContain('<strong>report</strong>');
    expect(mime).toContain('<b>Me</b> at Acme');
    expect(mime).toContain('Can you send the report?');
    expect(mime).not.toContain('Old draft text');
    expect(mime).toMatch(/filename=report\.pdf/);
    expect(mime).toMatch(/src="cid:(ii_[0-9a-f]+)"[\s\S]*^X-Attachment-Id: \1$/m);
    expectNoCredential(result);
});

test('draft update keeps what it is not told to change and re-renders a new body', async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, 'body.md'), 'New text');
    const gmail = fake({ messages: invoiceThread(), drafts: [{ id: 'd1', messageId: 'md' }], sendAs: SEND_AS });
    const update = ['gmail', 'draft', 'update', 'd1', '--subject', '', '--no-signature'];

    const missing = await run(gmail, [...update, '--remove-attachment', 'nope.pdf']);
    const missingCalls = takeCalls(gmail);
    const updated = await run(gmail, [
        ...update,
        '--body-file',
        path.join(root, 'body.md'),
        '--remove-attachment',
        'old.pdf',
    ]);

    expect(missing.exitCode).toBe(1);
    expect(missing.errors).toContain("No attachment named 'nope.pdf' (the draft has: keep.pdf, old.pdf)");
    expect(missingCalls).toEqual([
        'GET /drafts/d1',
        'GET /messages/md/attachments/ANGjdJ-md-2',
        'GET /messages/md/attachments/ANGjdJ-md-3',
    ]);
    expect(updated.errors).toBe('');
    expect(updated.stdout).toBe(
        'Draft updated: d1 (message r-message-1, thread t1), changed: subject, body, attachments, ' +
            'attachments: keep.pdf (application/pdf, 4 B)\n',
    );
    expect(takeCalls(gmail)).toEqual([
        'GET /drafts/d1',
        'GET /messages/md/attachments/ANGjdJ-md-2',
        'GET /messages/md/attachments/ANGjdJ-md-3',
        'GET /threads/t1',
        'PUT /upload/drafts/d1',
    ]);
    const mime = unfold(gmail.uploads[0]?.message);
    expect(mime).toMatch(/^To: Jan <jan@example.com>$/m);
    expect(mime).toMatch(/^Cc: Ann <ann@example.com>$/m);
    expect(mime).not.toMatch(/^Subject:/m);
    expect(mime).toContain('New text');
    expect(mime).not.toContain('Old draft text');
    expect(mime).not.toContain('gmail_signature');
    expect(mime).toContain('Can you send the report?');
    expect(mime).toMatch(/filename=keep\.pdf/);
    expect(mime).not.toContain('old.pdf');
});

test('draft list prints one line per draft, and draft get the draft as Markdown without signature and quote', async () => {
    const gmail = fake({
        messages: [
            ...invoiceThread(),
            message({ id: 'mn', threadId: 't9', to: 'Ann <ann@example.com>', labelIds: ['DRAFT'], text: 'Hi' }),
        ],
        drafts: [
            { id: 'd1', messageId: 'md' },
            { id: 'd2', messageId: 'mn' },
        ],
    });

    const all = await run(gmail, ['gmail', 'draft', 'list']);
    const inThread = await run(gmail, ['gmail', 'draft', 'list', '--thread', 't1']);
    const draft = await run(gmail, ['gmail', 'draft', 'get', 'd1']);

    expect(all.stdout).toBe(
        'd1\tt1\tMon, 2 Nov 2026 10:00:00 +0100\tJan <jan@example.com>\tRe: Invoice\treply\n' +
            'd2\tt9\tMon, 2 Nov 2026 10:00:00 +0100\tAnn <ann@example.com>\tHello\tnew\n',
    );
    expect(inThread.stdout).toBe('d1\tt1\tMon, 2 Nov 2026 10:00:00 +0100\tJan <jan@example.com>\tRe: Invoice\treply\n');
    expect(draft.stdout).toBe(
        [
            'draft: d1',
            'id: md',
            'thread: t1',
            'from: Me <me@example.com>',
            'to: Jan <jan@example.com>',
            'cc: Ann <ann@example.com>',
            'subject: Re: Invoice',
            'in-reply-to: <m1@example.com>',
            'attachment: keep.pdf application/pdf 4 B',
            'attachment: old.pdf application/pdf 3 B',
            '',
            'Old draft text',
            '',
        ].join('\n'),
    );
});

test('draft discard trashes the message of a draft, and refuses a message not labelled DRAFT', async () => {
    const gmail = fake({
        messages: invoiceThread(),
        drafts: [
            { id: 'd1', messageId: 'md' },
            { id: 'd2', messageId: 'm1' },
        ],
    });

    const discarded = await run(gmail, ['gmail', 'draft', 'discard', 'd1']);
    const discardedCalls = takeCalls(gmail);
    const refused = await run(gmail, ['gmail', 'draft', 'discard', 'd2']);

    expect(discarded.stdout).toBe(
        'Draft discarded: d1 (message md, thread t1, subject "Re: Invoice"), moved to the Trash for 30 days\n',
    );
    expect(discardedCalls).toEqual(['GET /drafts/d1', 'POST /messages/md/trash']);
    expect(refused.exitCode).toBe(1);
    expect(refused.errors).toContain('d2 is not a draft - refusing to discard it.');
    expect(takeCalls(gmail)).toEqual(['GET /drafts/d2']);
    expectNoCredential(discarded);
});

test('thread label changes the labels in one call, moving the thread within a group and creating its label', async () => {
    const gmail = fake({
        labels: [...LABELS, { id: 'Label_9', name: 'Todo', type: 'user' }],
        messages: [message({ id: 'm1', threadId: 't1', labelIds: ['INBOX', 'Label_9'] })],
    });

    const result = await run(gmail, [
        'gmail',
        'thread',
        'label',
        't1',
        '--set',
        'status=waiting',
        '--add',
        'clients/acme',
    ]);

    expect(result.errors).toBe('');
    expect(result.stdout).toBe('Thread updated: t1 (status: Waiting; added: clients/acme)\n');
    expect(gmail.requests.filter(request => request.method === 'POST').map(request => request.body)).toEqual([
        { name: 'Waiting', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        { addLabelIds: ['Label_7', 'Label_new_3'], removeLabelIds: ['Label_9'] },
    ]);
    expect(takeCalls(gmail)).toEqual(['GET /labels', 'GET /threads/t1', 'POST /labels', 'POST /threads/t1/modify']);
});

test.each([
    [['--remove', 'INBOX'], 'Removing INBOX (archiving) requires an archive marker'],
    [['--add', 'Todo'], 'Labels Todo belong to an exclusive group'],
    [['--set', 'status=Later'], "'Later' is not in group 'status'"],
    [['--set', 'status=Waiting', '--add', 'Nope'], "Label 'Nope' not found"],
])('thread label %p writes nothing and exits 1 with the reason', async (change, reason) => {
    const gmail = fake({ messages: [message({ id: 'm1', threadId: 't1', labelIds: ['INBOX'] })] });

    const result = await run(gmail, ['gmail', 'thread', 'label', 't1', ...change]);

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(reason);
    expect(writes(gmail)).toEqual([]);
});

test.each(['TRASH', 'SPAM'])('thread label --add %s moves the thread there, and --remove undoes it', async label => {
    const gmail = fake({ messages: [message({ id: 'm1', threadId: 't1', labelIds: ['INBOX'] })] });

    const added = await run(gmail, ['gmail', 'thread', 'label', 't1', '--add', label]);
    const removed = await run(gmail, ['gmail', 'thread', 'label', 't1', '--remove', label]);

    expect(added.stdout).toBe(`Thread updated: t1 (added: ${label})\n`);
    expect(removed.exitCode).toBe(0);
    expect(writes(gmail).map(request => request.body)).toEqual([{ addLabelIds: [label] }, { removeLabelIds: [label] }]);
});

test.each([
    ['DELETE', '/messages/m1'],
    ['DELETE', '/threads/t1'],
    ['DELETE', '/drafts/d1'],
    ['POST', '/messages/batchDelete'],
    ['POST', '/messages/send'],
    ['POST', '/drafts/send'],
])('the fake Gmail records %s %s, a permanent delete or a send, as a violation', async (method, route) => {
    const gmail = fake({ messages: invoiceThread(), drafts: [{ id: 'd1', messageId: 'md' }] });

    const response = await fetch(`${gmail.endpoints.apiRootUrl!}/gmail/v1/users/me${route}`, {
        method,
        headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    expect(response.status).toBe(403);
    // Taken, so the check after each test sees none.
    expect(gmail.violations.splice(0)).toEqual([`${method} ${route}`]);
});

test('labels create creates a label only when none of that name exists', async () => {
    const gmail = fake({});

    const existing = await run(gmail, ['gmail', 'labels', 'create', 'clients/acme']);
    const existingCalls = takeCalls(gmail);
    const created = await run(gmail, ['gmail', 'labels', 'create', 'Projects/New']);

    expect(existing.stdout).toBe('Label exists: Label_7 Clients/Acme\n');
    expect(existingCalls).toEqual(['GET /labels']);
    expect(created.stdout).toBe('Label created: Label_new_2 Projects/New\n');
    expect(takeCalls(gmail)).toEqual(['GET /labels', 'POST /labels']);
});

test('labels cleanup deletes only the empty user labels under the prefix the label rules leave alone', async () => {
    const gmail = fake({
        labels: [
            { id: 'TRASH', name: 'TRASH', type: 'system', messagesTotal: 0 },
            { id: 'Label_9', name: 'Todo', type: 'user', messagesTotal: 0 },
            { id: 'Label_20', name: 'Temp', type: 'user', messagesTotal: 0 },
            { id: 'Label_21', name: 'Taxes', type: 'user', messagesTotal: 3 },
            { id: 'Label_22', name: 'Clients/Temp', type: 'user', messagesTotal: 0 },
        ],
    });

    const dryRun = await run(gmail, ['gmail', 'labels', 'cleanup', 't', '--dry-run']);
    const dryRunCalls = takeCalls(gmail);
    const cleaned = await run(gmail, ['gmail', 'labels', 'cleanup', 't']);

    const report = 'skipped\tTodo\tthe label rules depend on it\nDELETE\tTemp\nskipped\tTaxes\t3 messages\n';
    expect(dryRun.stdout).toBe(report.replace('DELETE', 'would delete'));
    expect(dryRunCalls).toEqual(['GET /labels', 'GET /labels/Label_20', 'GET /labels/Label_21']);
    expect(cleaned.stdout).toBe(report.replace('DELETE', 'deleted'));
    expect(takeCalls(gmail)).toEqual([
        'DELETE /labels/Label_20',
        'GET /labels',
        'GET /labels/Label_20',
        'GET /labels/Label_21',
    ]);
});

test.each([
    [['labels', 'list']],
    [['draft', 'create', '--to', 'jan@example.com']],
    [['draft', 'discard', 'd1']],
    [['thread', 'label', 't1', '--add', 'Clients/Acme']],
    [['labels', 'cleanup', 'Clients']],
])('gmail %p as an account outside the allowed ones is refused by name before any call', async args => {
    const gmail = fake({});

    const result = await run(gmail, ['gmail', ...args, '--account', 'eve@example.com'], { stdin: 'Hi' });

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
    const auth = testAuthOptions({ stores: [], tokens: TOKENS });

    expect(() => defineGmailCommands({ auth, labels: { views: {}, require: [{ when: 'X', group: 'nope' }] } })).toThrow(
        "unknown group 'nope'",
    );
});

interface RunOptions {
    stdin?: string;
}

function fake(options: Omit<FakeGmailOptions, 'email'>) {
    const gmail = startFakeGmail({ email: EMAIL, labels: LABELS, ...options });
    fakes.push(gmail);
    return gmail;
}

function run(gmail: ReturnType<typeof startFakeGmail>, args: string[], options: RunOptions = {}) {
    const store = createMemoryStore({
        id: 'only',
        data: { ...CLIENT_KEYS, [TOKENS.name]: tokensValue(EMAIL) },
    });
    const commands = defineGmailCommands({
        auth: testAuthOptions({
            stores: [store.store],
            secrets: [TOKENS],
            tokens: TOKENS,
            accounts: ['*@example.com'],
        }),
        labels: RULES,
    });

    return runCommands({ commands, args, endpoints: gmail.endpoints, stdin: options.stdin });
}

/** A thread from Jan, and a reply drafted in it with two attachments. */
function invoiceThread(): FakeGmailMessage[] {
    return [
        message({
            id: 'm1',
            threadId: 't1',
            subject: 'Invoice',
            labelIds: ['INBOX'],
            headers: { 'Message-ID': '<m1@example.com>' },
            html: '<p>Can you send the report?</p>',
        }),
        message({
            id: 'md',
            threadId: 't1',
            from: 'Me <me@example.com>',
            to: 'Jan <jan@example.com>',
            cc: 'Ann <ann@example.com>',
            subject: 'Re: Invoice',
            labelIds: ['DRAFT'],
            headers: { 'In-Reply-To': '<m1@example.com>' },
            html: '<div dir="ltr"><p>Old draft text</p></div>',
            attachments: [
                { partId: '2', filename: 'keep.pdf', mimeType: 'application/pdf', content: 'keep' },
                { partId: '3', filename: 'old.pdf', mimeType: 'application/pdf', content: 'old' },
            ],
        }),
    ];
}

function message(overrides: Partial<FakeGmailMessage> & Pick<FakeGmailMessage, 'id' | 'threadId'>): FakeGmailMessage {
    return {
        from: 'Jan <jan@example.com>',
        subject: 'Hello',
        date: 'Mon, 2 Nov 2026 10:00:00 +0100',
        ...overrides,
    };
}

async function tempDir() {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-cli-test-')));
    tmpDirs.push(dir);
    return dir;
}

/** The calls made since the last take, as sorted `METHOD path` lines; concurrent calls have no order. */
function takeCalls(gmail: ReturnType<typeof startFakeGmail>) {
    return gmail.requests
        .splice(0)
        .map(request => `${request.method} ${request.path}`)
        .toSorted();
}

function writes(gmail: ReturnType<typeof startFakeGmail>) {
    return gmail.requests.filter(request => request.method !== 'GET');
}

/** The MIME text with its quoted-printable parts decoded (ASCII only, as the tests write). */
function unfold(mime: string | undefined) {
    return (mime ?? '')
        .replace(/[=]\r?\n/g, '')
        .replace(/[=]([0-9A-F]{2})/g, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
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
