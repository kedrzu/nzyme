import type { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

/**
 * Reads a message body piped into a Slack command, as `send` and `edit` both take it. Only reads
 * stdin when something is actually piped in — reading an interactive TTY would hang the command
 * forever with no output explaining why.
 */
export async function readStdinBody(stdin: Readable): Promise<string> {
    if ('isTTY' in stdin && stdin.isTTY === true) {
        return '';
    }

    return await text(stdin);
}
