import type { Readable } from 'node:stream';
import { ReadStream } from 'node:tty';

import { readHiddenInput } from './utils/readHiddenInput.js';

/** Options of {@link promptSecret}. */
export interface PromptSecretParams {
    /** The secret's name, shown as the dialog's title and first line. */
    name: string;
    /** What the value is and where to find it, shown under the name. */
    hint: string | undefined;
    /** Read only when it is a terminal and no desktop dialog could open. */
    stdin: Readable;
    /** Which dialog tools to try; a parameter so tests cover every platform on any host. */
    platform?: NodeJS.Platform;
    /** Where the dialog tools are looked up (`PATH`) and whether Linux has a display. */
    env?: Record<string, string | undefined>;
    /** Milliseconds after which a dialog still open is closed and counted as cancelled. */
    timeout?: number;
}

/**
 * What the user did: typed a value, closed the dialog without one, or could not be asked from here
 * at all (no desktop dialog and no terminal — e.g. an agent's shell over ssh).
 */
export type PromptSecretResult =
    | { status: 'entered'; value: string }
    | { status: 'cancelled' }
    | { status: 'unavailable' };

/** A dialog tool, how to call it, and which of its exit codes mean the user cancelled. */
interface DialogTool {
    command: string;
    args: string[];
    /** The script, fed on stdin so nothing user-provided is ever part of script text. */
    script?: string;
    /** Extra variables the script reads its texts from. */
    env?: Record<string, string>;
    cancelCodes: number[];
}

/** What a dialog shows: the secret's name, the window title and the message under it. */
interface DialogTexts {
    name: string;
    title: string;
    message: string;
}

/** Options of {@link getDialogTools}. */
interface GetDialogToolsOptions {
    platform: NodeJS.Platform;
    env: Record<string, string | undefined>;
    texts: DialogTexts;
}

/** Options of {@link runDialogTool}. */
interface RunDialogToolOptions {
    tool: DialogTool;
    env: Record<string, string | undefined>;
    /** Milliseconds after which the dialog is killed. */
    timeout: number;
}

const NOTICE = 'Nothing you type here is visible to the agent.';
const DIALOG_TIMEOUT_SECONDS = 300;
/**
 * GTK's untranslated warning before it exits 1 when `DISPLAY`/`WAYLAND_DISPLAY` is set but
 * unreachable (a stale ssh or tmux session). Without it, zenity's exit 1 would read as a cancel.
 */
const CANNOT_OPEN_DISPLAY = /cannot open display/i;

/** Title and message arrive as argv items after `-`; a cancel (-128) or a timeout returns "". */
const APPLESCRIPT = `
on run argv
    try
        set answer to display dialog (item 2 of argv) with title (item 1 of argv) default answer "" with hidden answer with icon note giving up after ${DIALOG_TIMEOUT_SECONDS}
    on error number -128
        return ""
    end try
    if gave up of answer then return ""
    return text returned of answer
end run
`;

/**
 * Windows PowerShell 5.1 shows Get-Credential as a GUI dialog; pwsh 7 asks in the console, which a
 * non-interactive shell cannot answer, so only `powershell.exe` is tried. Texts come from env vars.
 */
const POWERSHELL = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try {
    $c = Get-Credential -UserName $env:NZYME_SECRET_PROMPT_NAME -Message $env:NZYME_SECRET_PROMPT_MESSAGE
} catch { exit 5 }
if ($null -eq $c) { exit 4 }
[Console]::Out.Write($c.GetNetworkCredential().Password)
`;

/**
 * Asks the user for a secret's value in a native masked dialog (osascript, PowerShell
 * Get-Credential, zenity or kdialog), falling back to a hidden terminal prompt. The internal dialog
 * layer of `secrets set --prompt`: the value is read inside this process, so it never reaches an
 * agent's transcript, nor any argv or env. Returns the value untrimmed, with trailing newlines
 * removed; validating it is the caller's job.
 */
export async function promptSecret(params: PromptSecretParams): Promise<PromptSecretResult> {
    const env = params.env ?? process.env;
    const timeout = params.timeout ?? DIALOG_TIMEOUT_SECONDS * 1000;
    const title = `${params.name} - nzyme secrets`;
    const message = [params.name, params.hint, NOTICE].filter(Boolean).join('\n\n');

    const tools = getDialogTools({
        platform: params.platform ?? process.platform,
        env,
        texts: { name: params.name, title, message },
    });

    for (const tool of tools) {
        const result = await runDialogTool({ tool, env, timeout });
        if (result) {
            return result;
        }
    }

    const stdin = params.stdin;
    if (stdin instanceof ReadStream && stdin.isTTY) {
        const label = params.hint ? `${params.name} (${params.hint})` : params.name;
        const value = await readHiddenInput(label, stdin);
        return value ? { status: 'entered', value } : { status: 'cancelled' };
    }

    return { status: 'unavailable' };
}

function getDialogTools(options: GetDialogToolsOptions): DialogTool[] {
    const { platform, env } = options;
    const { name, title, message } = options.texts;
    switch (platform) {
        case 'darwin':
            return [{ command: 'osascript', args: ['-', title, message], script: APPLESCRIPT, cancelCodes: [] }];
        case 'win32':
            return [
                {
                    command: 'powershell.exe',
                    args: ['-NoProfile', '-Command', POWERSHELL],
                    env: { NZYME_SECRET_PROMPT_NAME: name, NZYME_SECRET_PROMPT_MESSAGE: message },
                    cancelCodes: [4],
                },
            ];
        case 'linux':
            if (!env.DISPLAY && !env.WAYLAND_DISPLAY) {
                return [];
            }

            // 1 is a cancel for both, 5 a zenity timeout; zenity also exits 1 when GTK cannot open the
            // display, which runDialogTool tells apart by its stderr. kdialog aborts on that instead.
            // `zenity --password` shows no message text. Neither tool shows its label verbatim, so the
            // message is escaped for each.
            return [
                {
                    command: 'zenity',
                    args: [
                        '--entry',
                        '--hide-text',
                        `--title=${title}`,
                        `--text=${escapeZenityText(message)}`,
                        `--timeout=${DIALOG_TIMEOUT_SECONDS}`,
                    ],
                    cancelCodes: [1, 5],
                },
                {
                    command: 'kdialog',
                    args: ['--title', title, '--password', escapeKdialogText(message)],
                    cancelCodes: [1],
                },
            ];
        default:
            return [];
    }
}

/**
 * zenity's entry label unescapes C sequences (`g_strcompress`: `\n`, `\\`, and drops any other
 * backslash), then reads `_` as a mnemonic marker; real newlines pass through both.
 */
function escapeZenityText(text: string) {
    return text.replace(/\\/g, '\\\\').replace(/_/g, '__');
}

/**
 * kdialog unescapes `\n` and `\\` in its argument, then KPasswordDialog shows it in a `Qt::RichText`
 * label: HTML is rendered and real newlines collapse into spaces, so they become `<br>`.
 */
function escapeKdialogText(text: string) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}

/** Runs one dialog tool; `null` means it could not open here and the next one should be tried. */
async function runDialogTool(options: RunDialogToolOptions): Promise<PromptSecretResult | null> {
    const { tool, env, timeout } = options;
    // A bare `Bun.which` ignores a PATH assigned at runtime, so the lookup gets it explicitly.
    const executable = Bun.which(tool.command, { PATH: env.PATH ?? '' });
    if (!executable) {
        return null;
    }

    let proc;
    try {
        proc = Bun.spawn([executable, ...tool.args], {
            env: { ...env, ...tool.env },
            stdin: tool.script ? new TextEncoder().encode(tool.script) : 'ignore',
            stdout: 'pipe',
            // Only matched, never forwarded: the tool's diagnostics are no business of the agent's
            // transcript.
            stderr: 'pipe',
            timeout,
        });
    } catch {
        return null;
    }

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);

    if (proc.signalCode != null) {
        // Killed by our timeout: the user left the dialog open. Any other signal: it never worked.
        return proc.killed ? { status: 'cancelled' } : null;
    }

    if (exitCode === 0) {
        const value = stdout.replace(/[\r\n]+$/, '');
        return value ? { status: 'entered', value } : { status: 'cancelled' };
    }

    // Any other code, or a display that could not be opened, means no GUI session (ssh, a stale
    // display, a locked-down daemon): try the next way.
    const cancelled = tool.cancelCodes.includes(exitCode) && !CANNOT_OPEN_DISPLAY.test(stderr);
    return cancelled ? { status: 'cancelled' } : null;
}
