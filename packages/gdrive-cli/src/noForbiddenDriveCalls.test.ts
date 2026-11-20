import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { expect, test } from 'bun:test';

// The `drive` scope allows deleting files, emptying the trash and sharing; only the code keeps the
// commands from it. Comments count too: a mention is either a call or an invitation to write one.
// `.permissions.` is any call of the sharing resource (`drive.permissions.create`); the module
// `./permissions.js` holds the CLI's own switches and does not match.
const FORBIDDEN = [
    'files.delete',
    'drives.delete',
    'emptyTrash',
    '.permissions.',
    'permissions.create',
    'permissions.update',
    'permissions.delete',
];

test('no Drive source deletes a file permanently, empties the trash or touches sharing', async () => {
    const files = await fs.readdir(import.meta.dir, { recursive: true });
    // Tests and their fixtures name the endpoints to catch them.
    const sources = files
        .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('__fixtures__'))
        .toSorted();
    const texts = await Promise.all(
        sources.map(async file => ({ file, text: await fs.readFile(path.join(import.meta.dir, file), 'utf8') })),
    );

    const found = texts.flatMap(({ file, text }) =>
        FORBIDDEN.filter(name => text.includes(name)).map(name => `${file}: ${name}`),
    );

    expect(sources).toContain('defineDriveTrashCommand.ts');
    expect(found).toEqual([]);
});
