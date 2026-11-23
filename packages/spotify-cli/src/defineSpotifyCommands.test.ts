import { afterEach, expect, spyOn, test } from 'bun:test';

import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';

import type { FakeSpotify, FakeSpotifyOptions } from './__fixtures__/fakeSpotify.js';
import { ACCESS_TOKEN, apiError, CREDENTIALS, startFakeSpotify } from './__fixtures__/fakeSpotify.js';
import { runSpotifyCommand, SPOTIFY_TOKEN, testTokenValue } from './__fixtures__/spotifyTestCli.js';

const fakes: FakeSpotify[] = [];

/** What Development Mode apps no longer get: no command may print it. */
const POPULARITY = 987654;
const FOLLOWERS = 123456;

afterEach(async () => {
    const stopped = fakes.splice(0);
    await Promise.all(stopped.map(spotify => spotify.stop()));
    for (const spotify of stopped) {
        expect(spotify.violations).toEqual([]);
    }
});

const artist = (id: string, genres: string[] = []) => ({
    id,
    name: `Artist ${id}`,
    uri: `spotify:artist:${id}`,
    genres,
    popularity: POPULARITY,
    followers: { total: FOLLOWERS },
});
const track = (id: string, durationMs = 187_000) => ({
    id,
    name: `Track ${id}`,
    uri: `spotify:track:${id}`,
    type: 'track',
    artists: [artist('a1'), artist('a2')],
    album: { name: 'The Album' },
    duration_ms: durationMs,
    track_number: 3,
    popularity: POPULARITY,
});
const album = (id: string) => ({
    id,
    name: `Album ${id}`,
    uri: `spotify:album:${id}`,
    artists: [artist('a1')],
    release_date: '2020-05-01',
    album_type: 'single',
});
const page = (items: unknown[], next: string | null = null, offset = 0) => ({
    items,
    total: 99,
    offset,
    limit: 20,
    next,
    href: '',
});

interface ReadCase {
    name: string;
    args: string[];
    path: string;
    body: unknown;
    stdout: string[];
}

const READS: ReadCase[] = [
    {
        name: 'top artists',
        args: ['top', 'artists'],
        path: '/me/top/artists',
        body: page([artist('a1', ['indie', 'folk']), artist('a2')]),
        stdout: ['spotify:artist:a1\tArtist a1\tindie, folk', 'spotify:artist:a2\tArtist a2\t'],
    },
    {
        name: 'top tracks',
        args: ['top', 'tracks'],
        path: '/me/top/tracks',
        body: page([track('t1')]),
        stdout: ['spotify:track:t1\tTrack t1\tArtist a1, Artist a2\tThe Album'],
    },
    {
        name: 'recent',
        args: ['recent'],
        path: '/me/player/recently-played',
        body: { items: [{ track: track('t1'), played_at: '2026-11-02T08:00:00Z' }], next: null, cursors: {} },
        stdout: ['spotify:track:t1\tTrack t1\tArtist a1, Artist a2\t2026-11-02T08:00:00Z'],
    },
    {
        name: 'saved tracks',
        args: ['saved', 'tracks'],
        path: '/me/tracks',
        body: page([{ track: track('t1'), added_at: '2026-10-01T00:00:00Z' }]),
        stdout: ['spotify:track:t1\tTrack t1\tArtist a1, Artist a2\tThe Album\t2026-10-01T00:00:00Z'],
    },
    {
        name: 'saved albums',
        args: ['saved', 'albums'],
        path: '/me/albums',
        body: page([{ album: album('b1'), added_at: '2026-09-01T00:00:00Z' }]),
        stdout: ['spotify:album:b1\tAlbum b1\tArtist a1\t2020-05-01\t2026-09-01T00:00:00Z'],
    },
    {
        name: 'following',
        args: ['following'],
        path: '/me/following',
        body: { artists: { ...page([artist('a1', ['rock'])]), cursors: {} } },
        stdout: ['spotify:artist:a1\tArtist a1\trock'],
    },
    {
        name: 'playlist list (items.total, public and private)',
        args: ['playlist', 'list'],
        path: '/me/playlists',
        body: page([
            { uri: 'spotify:playlist:p1', name: 'Mix', owner: { id: 'owner' }, items: { total: 12 }, public: true },
            { uri: 'spotify:playlist:p2', name: 'Old', owner: { id: 'ann' }, tracks: { total: 3 }, public: false },
        ]),
        stdout: ['spotify:playlist:p1\tMix\towner\t12\tpublic', 'spotify:playlist:p2\tOld\tann\t3\tprivate'],
    },
    {
        name: 'playlist items (null skipped)',
        args: ['playlist', 'items', 'p1'],
        path: '/playlists/p1/items',
        body: page([
            { item: track('t1'), added_at: '2026-08-01T00:00:00Z' },
            null,
            { track: track('t2'), added_at: 'x' },
        ]),
        stdout: [
            'spotify:track:t1\tTrack t1\tArtist a1, Artist a2\t2026-08-01T00:00:00Z',
            'spotify:track:t2\tTrack t2\tArtist a1, Artist a2\tx',
        ],
    },
    {
        name: 'artist and its albums',
        args: ['artist', 'spotify:artist:a1'],
        path: '/artists/a1',
        body: artist('a1', ['indie']),
        stdout: ['spotify:artist:a1\tArtist a1\tindie', 'spotify:album:b1\tAlbum b1\t2020-05-01\tsingle'],
    },
    {
        name: 'album and its tracks',
        args: ['album', 'https://open.spotify.com/album/b1?si=x'],
        path: '/albums/b1',
        body: { ...album('b1'), tracks: page([track('t1', 187_000), track('t2', 61_999)]) },
        stdout: [
            'spotify:album:b1\tAlbum b1\tArtist a1\t2020-05-01',
            'spotify:track:t1\t3\tTrack t1\tArtist a1, Artist a2\t3:07',
            'spotify:track:t2\t3\tTrack t2\tArtist a1, Artist a2\t1:01',
        ],
    },
    {
        name: 'now-playing',
        args: ['now-playing'],
        path: '/me/player/currently-playing',
        body: { is_playing: false, progress_ms: 65_000, item: track('t1', 200_000) },
        stdout: ['spotify:track:t1\tTrack t1\tArtist a1, Artist a2\t1:05/3:20\tpaused'],
    },
];

test.each(READS)('$name prints the compact lines, never popularity or followers', async read => {
    const spotify = fake({
        api: (_request, path) => {
            if (path === read.path) {
                return Response.json(read.body);
            }

            // The artist command also lists the albums.
            return path === '/artists/a1/albums' ? Response.json(page([album('b1')])) : undefined;
        },
    });

    const result = await run(spotify, read.args);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(read.stdout.map(line => `${line}\n`).join(''));
    expect(result.stdout).not.toContain(String(POPULARITY));
    expect(result.stdout).not.toContain(String(FOLLOWERS));
    expect(result.stderr).toBe('');
});

test('search sends the types as one comma list, prints type-first lines and skips null hits', async () => {
    const spotify = fake({
        api: (_request, path) =>
            path === '/search'
                ? Response.json({
                      artists: page([artist('a1', ['rock']), null]),
                      tracks: page([track('t1')]),
                      albums: page([album('b1')]),
                      playlists: page([null, { uri: 'spotify:playlist:p1', name: 'Mix', owner: { id: 'ann' } }]),
                  })
                : undefined,
    });

    const result = await run(spotify, ['search', 'karma police', '--type', 'artist,track,album,playlist']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
        [
            'artist\tspotify:artist:a1\tArtist a1\trock',
            'track\tspotify:track:t1\tTrack t1\tArtist a1, Artist a2',
            'album\tspotify:album:b1\tAlbum b1\tArtist a1',
            'playlist\tspotify:playlist:p1\tMix\tann',
        ].join('\n') + '\n',
    );
    const request = spotify.requests.find(({ path }) => path === '/search');
    expect(request?.query.getAll('type')).toEqual(['artist,track,album,playlist']);
    expect(request?.query.get('q')).toBe('karma police');
    expect(request?.query.get('limit')).toBe('10');
});

test('a search with no --type looks for artists, tracks and albums', async () => {
    const spotify = fake({ api: (_request, path) => (path === '/search' ? Response.json({}) : undefined) });

    const result = await run(spotify, ['search', 'x']);

    expect(result.exitCode).toBe(0);
    expect(spotify.requests.find(({ path }) => path === '/search')?.query.getAll('type')).toEqual([
        'artist,track,album',
    ]);
});

test.each([
    ['top artists --limit 51'],
    ['top tracks --limit 0'],
    ['recent --limit 51'],
    ['saved tracks --limit 51'],
    ['saved albums --limit abc'],
    ['following --limit 51'],
    ['playlist list --limit 51'],
    ['playlist items p1 --limit 51'],
    ['search x --limit 11'],
    ['search x --type artist,show'],
    ['top artists --range year'],
    ['artist spotify:track:abc'],
])('"%s" is a UsageError before any request', async line => {
    const spotify = fake();

    const result = await run(spotify, line.split(' '));

    expect(result.exitCode).not.toBe(0);
    expect(spotify.requests).toEqual([]);
    expect(spotify.refreshes).toEqual([]);
});

test.each<[string, string[], unknown, string]>([
    [
        'top artists',
        ['top', 'artists', '--limit', '1', '--offset', '19'],
        page([artist('a1')], 'next', 19),
        '--offset 20',
    ],
    [
        'following',
        ['following'],
        { artists: { ...page([artist('a1')], 'next'), cursors: { after: 'a2' } } },
        '--after a2',
    ],
    [
        'recent',
        ['recent'],
        { items: [{ track: track('t1'), played_at: 'x' }], next: 'next', cursors: { before: '1700000000000' } },
        '--before 1700000000000',
    ],
])('%s hints once on stderr when more follows', async (name, args, body, option) => {
    const path = { 'top artists': '/me/top/artists', following: '/me/following', recent: '/me/player/recently-played' }[
        name
    ];
    const spotify = fake({ api: (_request, requested) => (requested === path ? Response.json(body) : undefined) });

    const result = await run(spotify, args);

    expect(result.stderr).toBe(`More results: rerun with ${option}.\n`);
});

test('the last page prints no hint', async () => {
    const spotify = fake({
        api: (_request, path) => (path === '/me/top/artists' ? Response.json(page([artist('a1')])) : undefined),
    });

    const result = await run(spotify, ['top', 'artists']);

    expect(result.stderr).toBe('');
});

test('top sends the range as a time_range', async () => {
    const spotify = fake({
        api: (_request, path) => (path === '/me/top/tracks' ? Response.json(page([])) : undefined),
    });

    await run(spotify, ['top', 'tracks', '--range', 'long', '--limit', '5']);

    const request = spotify.requests.find(({ path }) => path === '/me/top/tracks');
    expect(request?.query.get('time_range')).toBe('long_term');
    expect(request?.query.get('limit')).toBe('5');
});

test('me shows the user, the display name and the sign-in expiry six months on', async () => {
    const spotify = fake({ user: { id: 'owner', displayName: 'Ann Owner' } });

    const result = await run(spotify, ['me']);

    expect(result).toMatchObject({
        exitCode: 0,
        stdout: 'owner\tAnn Owner\tsigned in 2026-11-01, expires 2027-05-01\n',
    });
});

test.each([
    ['204', () => new Response(null, { status: 204 })],
    ['an item-less 200', () => Response.json({ is_playing: false, currently_playing_type: 'unknown' })],
])('now-playing with %s says nothing plays and exits 0', async (_name, answer) => {
    const spotify = fake({ api: (_request, path) => (path === '/me/player/currently-playing' ? answer() : undefined) });

    const result = await run(spotify, ['now-playing']);

    expect(result).toMatchObject({ exitCode: 0, stdout: 'Nothing is playing.\n' });
});

test.each([[403], [404]])(
    'playlist items of a playlist the account cannot read (%d) is a plain usage error',
    async status => {
        const spotify = fake({
            api: (_request, path) => (path === '/playlists/p9/items' ? apiError(status, 'Forbidden') : undefined),
        });

        const result = await run(spotify, ['playlist', 'items', 'p9']);

        expect(result.exitCode).not.toBe(0);
        expect(result.errors).toContain('your own and collaborative playlists');
        expect(result.errors).not.toContain('HTTP');
    },
);

test('an unexpected status becomes a SpotifyError naming the operation and the status, not the body', async () => {
    const spotify = fake({
        api: (_request, path) => (path === '/me/top/artists' ? apiError(500, 'secret-body-detail') : undefined),
    });

    const result = await run(spotify, ['top', 'artists']);

    expect(result.exitCode).not.toBe(0);
    const output = result.stdout + result.errors;
    expect(output).toContain('top artists read failed with HTTP 500');
    expect(output).not.toContain('secret-body-detail');
});

const ID = '4iV5W9uYEdYUVa79Axb7Rh';
const writes = (spotify: FakeSpotify) => spotify.requests.filter(({ method }) => method !== 'GET');

test('playlist create posts the name, the description and a private default, and prints the list line', async () => {
    const spotify = fake({
        api: (request, path) =>
            request.method === 'POST' && path === '/me/playlists'
                ? Response.json(
                      {
                          uri: 'spotify:playlist:n1',
                          name: 'Evening',
                          owner: { id: 'owner' },
                          public: false,
                          items: { total: 0 },
                      },
                      { status: 201 },
                  )
                : undefined,
    });

    const result = await run(spotify, ['playlist', 'create', 'Evening', '--description', 'Slow songs']);

    expect(result).toMatchObject({ exitCode: 0, stdout: 'spotify:playlist:n1\tEvening\towner\t0\tprivate\n' });
    expect(writes(spotify)).toEqual([
        {
            method: 'POST',
            path: '/me/playlists',
            query: new URLSearchParams(),
            body: { name: 'Evening', description: 'Slow songs', public: false },
        },
    ]);
});

test('playlist create --public posts public: true', async () => {
    const spotify = fake({
        api: (request, path) =>
            request.method === 'POST' && path === '/me/playlists'
                ? Response.json(
                      { uri: 'spotify:playlist:n1', name: 'Mix', owner: { id: 'owner' }, public: true },
                      { status: 201 },
                  )
                : undefined,
    });

    const result = await run(spotify, ['playlist', 'create', 'Mix', '--public']);

    expect(result.stdout).toBe('spotify:playlist:n1\tMix\towner\t\tpublic\n');
    expect(writes(spotify)[0]?.body).toEqual({ name: 'Mix', public: true });
});

test('playlist add posts the normalised URIs and prints the count', async () => {
    const spotify = fake({
        api: (request, path) =>
            request.method === 'POST' && path === '/playlists/p1/items'
                ? Response.json({ snapshot_id: 's' }, { status: 201 })
                : undefined,
    });

    const result = await run(spotify, [
        'playlist',
        'add',
        'spotify:playlist:p1',
        `spotify:track:${ID}`,
        `https://open.spotify.com/episode/${ID}?si=x`,
    ]);

    expect(result).toMatchObject({ exitCode: 0, stdout: 'Added 2 items to spotify:playlist:p1.\n' });
    expect(writes(spotify)).toEqual([
        {
            method: 'POST',
            path: '/playlists/p1/items',
            query: new URLSearchParams(),
            body: { uris: [`spotify:track:${ID}`, `spotify:episode:${ID}`] },
        },
    ]);
});

test.each([
    ['more than 100 URIs', ['playlist', 'add', 'p1', ...Array.from({ length: 101 }, () => `spotify:track:${ID}`)]],
    ['an album URI', ['playlist', 'add', 'p1', `spotify:album:${ID}`]],
    ['a bare id', ['playlist', 'add', 'p1', ID]],
    ['one bad URI among good ones', ['playlist', 'add', 'p1', `spotify:track:${ID}`, 'nope']],
    ['no URI', ['playlist', 'add', 'p1']],
    ['a queued album', ['queue', 'add', `spotify:album:${ID}`]],
    ['a queued bare id', ['queue', 'add', ID]],
])('%s is refused before any request', async (_name, args) => {
    const spotify = fake();

    const result = await run(spotify, args);

    expect(result.exitCode).not.toBe(0);
    expect(spotify.requests).toEqual([]);
    expect(spotify.refreshes).toEqual([]);
});

test('playlist add of 100 URIs is sent', async () => {
    const spotify = fake({
        api: (request, path) =>
            request.method === 'POST' && path === '/playlists/p1/items'
                ? Response.json({ snapshot_id: 's' }, { status: 201 })
                : undefined,
    });

    const result = await run(spotify, [
        'playlist',
        'add',
        'p1',
        ...Array.from({ length: 100 }, () => `spotify:track:${ID}`),
    ]);

    expect(result.stdout).toBe('Added 100 items to spotify:playlist:p1.\n');
});

test.each([[403], [404]])(
    'playlist add to a playlist the account cannot change (%d) is a plain usage error',
    async status => {
        const spotify = fake({
            api: (_request, path) => (path === '/playlists/p9/items' ? apiError(status, 'Forbidden') : undefined),
        });

        const result = await run(spotify, ['playlist', 'add', 'p9', `spotify:track:${ID}`]);

        expect(result.exitCode).not.toBe(0);
        expect(result.errors).toContain('your own and collaborative playlists');
        expect(result.errors).not.toContain('HTTP');
    },
);

test('queue add posts the URI as a query and prints it', async () => {
    const spotify = fake({
        api: (request, path) =>
            request.method === 'POST' && path === '/me/player/queue' ? new Response(null, { status: 204 }) : undefined,
    });

    const result = await run(spotify, ['queue', 'add', `https://open.spotify.com/track/${ID}`]);

    expect(result).toMatchObject({ exitCode: 0, stdout: `Queued spotify:track:${ID}.\n` });
    expect(writes(spotify)).toEqual([
        {
            method: 'POST',
            path: '/me/player/queue',
            query: new URLSearchParams({ uri: `spotify:track:${ID}` }),
            body: undefined,
        },
    ]);
});

test('queue add accepts an episode', async () => {
    const spotify = fake({
        api: (request, path) =>
            request.method === 'POST' && path === '/me/player/queue' ? new Response(null, { status: 204 }) : undefined,
    });

    const result = await run(spotify, ['queue', 'add', `spotify:episode:${ID}`]);

    expect(result.stdout).toBe(`Queued spotify:episode:${ID}.\n`);
});

test('queue add with no active device (404) asks to start playback first', async () => {
    const spotify = fake({
        api: (_request, path) =>
            path === '/me/player/queue'
                ? Response.json(
                      {
                          error: {
                              status: 404,
                              message: 'Player command failed: No active device found',
                              reason: 'NO_ACTIVE_DEVICE',
                          },
                      },
                      { status: 404 },
                  )
                : undefined,
    });

    const result = await run(spotify, ['queue', 'add', `spotify:track:${ID}`]);

    expect(result.exitCode).not.toBe(0);
    expect(result.errors).toContain('start playback');
    expect(result.errors).not.toContain('HTTP');
});

test('the registered commands are exactly the curated commands, the read-only get and schema, and no write', async () => {
    const spotify = fake();

    const result = await run(spotify, []);

    // `spotify whoami` is the harness's own stand-in command, not part of the set.
    const listed = [...result.stdout.matchAll(/^\s+\d+\. nzyme spotify ([a-z -]+?)(?: [<[]|$)/gm)]
        .map(match => match[1])
        .filter(command => command !== 'whoami');
    expect(listed.toSorted()).toEqual(
        [
            'auth',
            'me',
            'top',
            'recent',
            'saved',
            'following',
            'search',
            'artist',
            'album',
            'playlist list',
            'playlist items',
            'playlist create',
            'playlist add',
            'queue add',
            'now-playing',
            'schema',
            'get',
        ].toSorted(),
    );
});

test('get signs in through the same unit and sends the refreshed access token as a Bearer, never printing it', async () => {
    const authorizations: (string | null)[] = [];
    const spotify = fake({
        api: request => {
            authorizations.push(request.headers.get('authorization'));
            return undefined;
        },
    });
    const original = globalThis.fetch;
    const forward = async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(String(input), init);
        const prefix = 'https://api.spotify.com/v1';
        return request.url.startsWith(prefix)
            ? original(new Request(spotify.endpoints.apiUrl + request.url.slice(prefix.length), request))
            : original(request);
    };
    const spy = spyOn(globalThis, 'fetch').mockImplementation(
        Object.assign(forward, { preconnect: original.preconnect }),
    );

    let result;
    try {
        result = await run(spotify, ['get', '/me']);
    } finally {
        spy.mockRestore();
    }

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ id: 'owner' });
    expect(authorizations).toEqual([`Bearer ${ACCESS_TOKEN}`]);
    expect(spotify.grants.length).toBeGreaterThan(0);
    for (const credential of CREDENTIALS) {
        expect(result.stdout + result.stderr + result.errors).not.toContain(credential);
    }
});

test('schema browses the committed spec offline, with no request and no credential', async () => {
    const spotify = fake();

    const result = await run(spotify, ['schema', '--search', 'top']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('/me/top/tracks');
    expect(spotify.requests).toEqual([]);
    expect(spotify.grants).toEqual([]);
});

function fake(options?: FakeSpotifyOptions) {
    const spotify = startFakeSpotify(options);
    fakes.push(spotify);
    return spotify;
}

function run(spotify: FakeSpotify, args: string[]) {
    const store = createMemoryStore({ id: 'only', data: { [SPOTIFY_TOKEN.name]: testTokenValue() }, persist: true });
    return runSpotifyCommand({ args: ['spotify', ...args], stores: [store.store], endpoints: spotify.endpoints });
}
