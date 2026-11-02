import type { Readable } from 'node:stream';
import { ReadStream } from 'node:tty';

import enquirer from 'enquirer';

/**
 * Reads a value the user must not see echoed: a password prompt when `stdin` is a terminal,
 * otherwise all of `stdin` with one trailing newline removed (so `echo value | …` works). Never
 * takes the value from an argument, where it would land in shell history and the process list.
 */
export async function readHiddenInput(label: string, stdin: Readable): Promise<string> {
    if (stdin instanceof ReadStream && stdin.isTTY) {
        // The prompt renders on stderr, so stdout carries only the command's own output.
        const answer = await enquirer.prompt<{ value: string }>({
            type: 'password',
            name: 'value',
            message: label,
            stdin,
            stdout: process.stderr,
        });

        return answer.value;
    }

    let text = '';
    stdin.setEncoding('utf8');
    for await (const chunk of stdin) {
        text += String(chunk);
    }

    return text.replace(/\r?\n$/, '');
}
