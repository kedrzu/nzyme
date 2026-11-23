import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { expect, test } from 'bun:test';

// The sign-in scopes allow adding only, but the generated client declares every endpoint, removal included.
// Only the code keeps the commands from `DELETE` and `PUT`. Comments count too: a mention is either a
// call or an invitation to write one.
const FORBIDDEN = ["'DELETE'", '"DELETE"', "'PUT'", '"PUT"'];

test('no Spotify source names the DELETE or PUT method', async () => {
    const sources = await readSources();

    const found = sources.flatMap(({ file, text }) =>
        FORBIDDEN.filter(name => text.includes(name)).map(name => `${file}: ${name}`),
    );

    const files = sources.map(source => source.file);
    expect(files).toContain('defineSpotifyPlaylistCreateCommand.ts');
    expect(files).toContain('defineSpotifyPlaylistAddCommand.ts');
    expect(files).toContain('defineSpotifyQueueAddCommand.ts');
    expect(files).toContain('operations/spotifyPlaylistItemsAdd.ts');
    expect(found).toEqual([]);
});

/** Every `.ts` file of the package but tests, fixtures and the generated schema, relative to `src`. */
async function readSources() {
    const files = await fs.readdir(import.meta.dir, { recursive: true });
    const sources = files
        .filter(
            file =>
                file.endsWith('.ts') &&
                !file.endsWith('.test.ts') &&
                !file.startsWith('__fixtures__') &&
                file !== 'schema.gen.ts',
        )
        .toSorted();

    return await Promise.all(
        sources.map(async file => ({ file, text: await fs.readFile(path.join(import.meta.dir, file), 'utf8') })),
    );
}
