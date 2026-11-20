import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { expect, test } from 'bun:test';

// The Gmail scopes allow sending and permanent deletion; only the code keeps the commands from them.
// Trashing is allowed: the Trash keeps a message for 30 days, and nothing may empty it, which takes a
// permanent delete. Comments count too: a mention is either a call or an invitation to write one.
const FORBIDDEN = ['.send(', 'drafts.delete', 'messages.delete', 'batchDelete', 'threads.delete'];

test('no Gmail source calls a method that sends mail or permanently deletes a message, thread or draft', async () => {
    const sources = await readSources();

    const found = sources.flatMap(({ file, text }) =>
        FORBIDDEN.filter(name => text.includes(name)).map(name => `${file}: ${name}`),
    );

    expect(sources.map(source => source.file)).toContain('defineGmailDraftDiscardCommand.ts');
    expect(found).toEqual([]);
});

// Only for a user label with no messages that no label rule protects.
test('labels.delete is called only from the command that guards it', async () => {
    const sources = await readSources();

    const callers = sources.filter(({ text }) => text.includes('labels.delete')).map(({ file }) => file);
    expect(callers).toEqual(['defineGmailLabelsCleanupCommand.ts']);
});

/** Every `.ts` file of the package but tests and their fixtures (which name the endpoints to catch them), relative to `src`. */
async function readSources() {
    const files = await fs.readdir(import.meta.dir, { recursive: true });
    const sources = files
        .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('__fixtures__'))
        .toSorted();

    return await Promise.all(
        sources.map(async file => ({ file, text: await fs.readFile(path.join(import.meta.dir, file), 'utf8') })),
    );
}
