import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

import type { PromptSecretResult } from './promptSecret.js';
import { promptSecret } from './promptSecret.js';

const SENTINEL = 'sentinel-secret-value-prompt-5c2d';
const NAME = 'API_KEY';
/**
 * Both quote kinds: spliced into AppleScript or PowerShell text, either would change the script. The
 * backslash, `&` and `<…>` are markup to zenity's and kdialog's labels, like the `_` in the name.
 */
const HINT = `Settings → "API" → it's the 'live' key in C:\\new & <b>`;
const TITLE = `${NAME} - nzyme secrets`;
const MESSAGE = `${NAME}\n\n${HINT}\n\nNothing you type here is visible to the agent.`;

type Tool = 'osascript' | 'powershell.exe' | 'zenity' | 'kdialog';

interface StandInOptions {
    code?: number;
    stdout?: string;
    stderr?: string;
    /** Seconds to hang before answering, as a dialog the user leaves open. */
    sleep?: number;
}

interface Recorded {
    argv: string[];
    env: string;
    stdin: string;
}

let dir = '';

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-prompt-secret-'));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

test('darwin: osascript gets the script on stdin, the texts as argv items, and returns the value', async () => {
    await standIn('osascript', { stdout: `${SENTINEL}\n` });

    const result = await prompt('darwin');

    const expected: PromptSecretResult = { status: 'entered', value: SENTINEL };
    expect(result).toEqual(expected);
    const recorded = await readRecorded('osascript');
    expect(recorded.argv).toEqual(['-', TITLE, MESSAGE]);
    expect(recorded.stdin).toContain('on run argv');
    expect(recorded.stdin).not.toContain(NAME);
    expect(recorded.stdin).not.toContain('live');
    expectNoLeak(recorded);
});

test('win32: PowerShell gets the texts through env, never in the -Command script', async () => {
    await standIn('powershell.exe', { stdout: SENTINEL });

    const result = await prompt('win32');

    const expected: PromptSecretResult = { status: 'entered', value: SENTINEL };
    expect(result).toEqual(expected);
    const recorded = await readRecorded('powershell.exe');
    expect(recorded.argv.slice(0, 2)).toEqual(['-NoProfile', '-Command']);
    expect(recorded.argv).toHaveLength(3);
    expect(recorded.argv[2]).toContain('Get-Credential');
    expect(recorded.argv[2]).not.toContain(NAME);
    expect(recorded.argv[2]).not.toContain('live');
    expect(recorded.env).toContain(`NZYME_SECRET_PROMPT_NAME=${NAME}\n`);
    expect(recorded.env).toContain(`NZYME_SECRET_PROMPT_MESSAGE=${MESSAGE}\n`);
    expectNoLeak(recorded);
});

test('linux: zenity gets the texts as argv items and returns the value', async () => {
    await standIn('zenity', { stdout: `${SENTINEL}\n` });

    const result = await prompt('linux');

    const expected: PromptSecretResult = { status: 'entered', value: SENTINEL };
    expect(result).toEqual(expected);
    const recorded = await readRecorded('zenity');
    const text = `API__KEY\n\nSettings → "API" → it's the 'live' key in C:\\\\new & <b>\n\nNothing you type here is visible to the agent.`;
    expect(recorded.argv).toEqual(['--entry', '--hide-text', `--title=${TITLE}`, `--text=${text}`, '--timeout=300']);
    expectNoLeak(recorded);
});

test('linux: kdialog is asked when zenity cannot open', async () => {
    await standIn('zenity', { code: 255 });
    await standIn('kdialog', { stdout: `${SENTINEL}\n` });

    const result = await prompt('linux');

    const expected: PromptSecretResult = { status: 'entered', value: SENTINEL };
    expect(result).toEqual(expected);
    const text = `API_KEY<br><br>Settings → "API" → it's the 'live' key in C:\\\\new &amp; &lt;b&gt;<br><br>Nothing you type here is visible to the agent.`;
    expect((await readRecorded('kdialog')).argv).toEqual(['--title', TITLE, '--password', text]);
});

test('linux: kdialog is asked when zenity has a display set that it cannot open', async () => {
    await standIn('zenity', {
        code: 1,
        stderr: '(zenity:4242): Gtk-WARNING **: 10:00:00.000: cannot open display: :0',
    });
    await standIn('kdialog', { stdout: `${SENTINEL}\n` });

    const result = await prompt('linux');

    const expected: PromptSecretResult = { status: 'entered', value: SENTINEL };
    expect(result).toEqual(expected);
});

test.each<[NodeJS.Platform, Tool, StandInOptions]>([
    ['darwin', 'osascript', { stdout: '\n' }],
    ['win32', 'powershell.exe', { code: 4 }],
    ['linux', 'zenity', { code: 1 }],
    // GTK's routine noise on a dialog that did open must not turn a cancel into a fall-through.
    ['linux', 'zenity', { code: 1, stderr: 'Gtk-Message: GtkDialog mapped without a transient parent.' }],
    ['linux', 'zenity', { code: 5 }],
])('%s: %s %o is a cancel, and nothing else is tried', async (platform, tool, options) => {
    await standIn(tool, options);
    await standIn('kdialog', { stdout: SENTINEL });

    const result = await prompt(platform);

    const expected: PromptSecretResult = { status: 'cancelled' };
    expect(result).toEqual(expected);
    expect(await exists('kdialog.argv')).toBe(false);
});

test('linux: a kdialog cancel is a cancel', async () => {
    await standIn('kdialog', { code: 1 });

    expect(await prompt('linux')).toEqual({ status: 'cancelled' });
});

test.each<[string, NodeJS.Platform, Tool[], number, Record<string, string>]>([
    ['osascript fails to open (no GUI session)', 'darwin', ['osascript'], 1, {}],
    ['osascript is missing', 'darwin', [], 0, {}],
    ['PowerShell fails to open', 'win32', ['powershell.exe'], 1, {}],
    ['zenity and kdialog fail to open', 'linux', ['zenity', 'kdialog'], 255, { DISPLAY: ':0' }],
    // Working tools that answer: asking them without a display would return a value.
    ['linux has no display', 'linux', ['zenity', 'kdialog'], 0, {}],
])('%s, with no terminal: unavailable, and stdin is never read', async (_, platform, tools, code, env) => {
    for (const tool of tools) {
        await standIn(tool, { code, stdout: SENTINEL });
    }

    const read = mock(() => {
        throw new Error('stdin must not be read');
    });
    const stdin = new Readable({ read });

    const result = await promptSecret({ name: NAME, hint: HINT, stdin, platform, env: { PATH: dir, ...env } });

    const expected: PromptSecretResult = { status: 'unavailable' };
    expect(result).toEqual(expected);
    expect(read).not.toHaveBeenCalled();
});

test('a dialog left open past the timeout is a cancel', async () => {
    await standIn('osascript', { sleep: 10, stdout: SENTINEL });

    const started = Date.now();
    const result = await promptSecret({
        name: NAME,
        hint: undefined,
        stdin: Readable.from([]),
        platform: 'darwin',
        env: { PATH: dir },
        timeout: 300,
    });

    const expected: PromptSecretResult = { status: 'cancelled' };
    expect(result).toEqual(expected);
    expect(Date.now() - started).toBeLessThan(5000);
});

function prompt(platform: NodeJS.Platform) {
    return promptSecret({
        name: NAME,
        hint: HINT,
        stdin: Readable.from([]),
        platform,
        env: { PATH: dir, DISPLAY: ':0' },
    });
}

/**
 * Writes an executable named like the dialog tool that records its argv (NUL-separated), env and
 * stdin next to itself, prints `stdout` and `stderr` and exits with `code`. PATH holds only `dir`, so every other
 * program is called by absolute path.
 */
async function standIn(tool: Tool, options: StandInOptions) {
    const base = path.join(dir, tool);
    await fs.writeFile(`${base}.out`, options.stdout ?? '');
    await fs.writeFile(`${base}.err`, options.stderr ?? '');
    const script = [
        '#!/bin/sh',
        `printf '%s\\0' "$@" > '${base}.argv'`,
        `/usr/bin/env > '${base}.env'`,
        `/bin/cat > '${base}.stdin'`,
        options.sleep ? `exec /bin/sleep ${options.sleep}` : '',
        `/bin/cat '${base}.out'`,
        `/bin/cat '${base}.err' >&2`,
        `exit ${options.code ?? 0}`,
    ].join('\n');
    await fs.writeFile(base, script, { mode: 0o755 });
}

async function readRecorded(tool: Tool): Promise<Recorded> {
    const base = path.join(dir, tool);
    const argv = await fs.readFile(`${base}.argv`, 'utf8');
    return {
        argv: argv.split('\0').slice(0, -1),
        env: await fs.readFile(`${base}.env`, 'utf8'),
        stdin: await fs.readFile(`${base}.stdin`, 'utf8'),
    };
}

function expectNoLeak(recorded: Recorded) {
    expect(recorded.argv.join('\n')).not.toContain(SENTINEL);
    expect(recorded.env).not.toContain(SENTINEL);
    expect(recorded.stdin).not.toContain(SENTINEL);
}

async function exists(file: string) {
    return fs
        .access(path.join(dir, file))
        .then(() => true)
        .catch(() => false);
}
