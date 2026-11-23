import { PassThrough, Readable } from 'node:stream';

import { afterEach, expect, spyOn, test } from 'bun:test';
import { Builtins, Cli } from 'clipanion';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { RuntimeConfig } from '@nzyme/config/RuntimeConfig.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

import { startFakeLastfm } from './__fixtures__/fakeLastfm.js';
import type { FakeLastfm } from './__fixtures__/fakeLastfm.js';
import { defineLastfmCommands } from './defineLastfmCommands.js';

const LASTFM_API_KEY = defineSecret('LASTFM_API_KEY');
const API_KEY = 'lastfm-key-sentinel-3f9a';
const NOT_FOUND = { json: { error: 6, message: 'The artist you supplied could not be found', links: [] } };

const fakes: FakeLastfm[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(fake => fake.stop()));
});

test('--help lists exactly the twelve Last.fm commands', async () => {
    const result = await run(startFake(), ['--help']);

    const listed = [...result.stdout.matchAll(/^\s+nzyme lastfm ([a-z-]+)\b/gm)].map(match => match[1]);
    expect(listed.toSorted()).toEqual([
        'album',
        'artist',
        'artist-top',
        'chart',
        'search',
        'similar-artists',
        'similar-tracks',
        'tag',
        'tag-top',
        'track',
        'user-recent',
        'user-top',
    ]);
});

test('similar-artists prints name, match and MBID per line, and the autocorrected name on stderr', async () => {
    const fake = startFake();
    fake.respond('artist.getSimilar', {
        json: {
            similarartists: {
                artist: [
                    { name: 'Madonna', mbid: 'mbid-madonna', match: '0.98765', url: 'https://last.fm/Madonna' },
                    { name: 'Sonny & Cher', mbid: '', match: '0.5', url: 'https://last.fm/Sonny' },
                ],
                '@attr': { artist: 'Cher' },
            },
        },
    });

    const result = await run(fake, ['lastfm', 'similar-artists', 'Chere', '--limit', '10']);

    expect(result).toMatchObject({ exitCode: 0, stderr: '# Cher\n' });
    expect(result.stdout).toBe('Madonna\t0.99\tmbid-madonna\nSonny & Cher\t0.50\t\n');
    expect(Object.fromEntries(fake.requests[0]?.query ?? [])).toMatchObject({ artist: 'Chere', limit: '10' });
});

test('similar-artists prints no note when the name resolves to itself, whatever its case', async () => {
    const fake = startFake();
    fake.respond('artist.getSimilar', {
        json: { similarartists: { artist: [], '@attr': { artist: 'Cher' } } },
    });

    const result = await run(fake, ['lastfm', 'similar-artists', 'cher']);

    expect(result).toMatchObject({ exitCode: 0, stdout: '', stderr: '' });
    expect(fake.requests[0]?.query.get('limit')).toBe('20');
});

test('artist prints its profile with a plain-text bio, then its similar artists', async () => {
    const fake = startFake();
    fake.respond('artist.getInfo', {
        json: {
            artist: {
                name: 'Cher',
                mbid: 'mbid-cher',
                url: 'https://last.fm/Cher',
                stats: { listeners: '123', playcount: '456' },
                similar: { artist: [{ name: 'Madonna', url: 'https://last.fm/Madonna' }] },
                tags: { tag: [{ name: 'pop' }, { name: 'dance' }] },
                bio: {
                    summary:
                        'Cher is a <b>singer</b> &amp; actress.\n\n<a href="https://www.last.fm/music/Cher">Read more on Last.fm</a>',
                },
            },
        },
    });

    const result = await run(fake, ['lastfm', 'artist', 'cher']);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toBe(
        [
            'name: Cher',
            'mbid: mbid-cher',
            'url: https://last.fm/Cher',
            'listeners: 123',
            'playcount: 456',
            'tags: pop, dance',
            'bio: Cher is a singer & actress.',
            'similar:',
            '  Madonna',
            '',
        ].join('\n'),
    );
});

test('album prints its profile and track list with m:ss durations, leaving out what Last.fm lacks', async () => {
    const fake = startFake();
    fake.respond('album.getInfo', {
        json: {
            album: {
                name: 'Believe',
                artist: 'Cher',
                mbid: '',
                url: 'https://last.fm/Cher/Believe',
                listeners: '10',
                playcount: '20',
                tracks: {
                    track: [
                        { name: 'Believe', duration: '239', '@attr': { rank: 1 }, artist: { name: 'Cher' } },
                        { name: 'The Power', duration: null, '@attr': { rank: 2 }, artist: { name: 'Cher' } },
                    ],
                },
                tags: '',
            },
        },
    });

    const result = await run(fake, ['lastfm', 'album', 'Cher', 'Believe']);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toBe(
        [
            'name: Believe',
            'artist: Cher',
            'url: https://last.fm/Cher/Believe',
            'listeners: 10',
            'playcount: 20',
            'tracks:',
            '  1\tBelieve\t3:59',
            '  2\tThe Power\t',
            '',
        ].join('\n'),
    );
});

test('user-recent prints now for the playing track and ISO 8601 UTC times for the rest', async () => {
    const fake = startFake();
    fake.respond('user.getRecentTracks', {
        json: {
            recenttracks: {
                track: [
                    {
                        artist: { '#text': 'Cher', mbid: 'mbid-cher' },
                        name: 'Believe',
                        mbid: '',
                        album: { '#text': 'Believe', mbid: 'mbid-believe' },
                        '@attr': { nowplaying: 'true' },
                    },
                    {
                        artist: { '#text': 'Madonna', mbid: '' },
                        name: 'Vogue',
                        mbid: 'mbid-vogue',
                        album: { '#text': '', mbid: '' },
                        date: { uts: '1795197840', '#text': '20 Nov 2026, 18:04' },
                    },
                ],
                '@attr': { user: 'rj' },
            },
        },
    });

    const result = await run(fake, ['lastfm', 'user-recent', 'rj', '--limit', '2']);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toBe('now\tCher\tBelieve\tBelieve\t\n2026-11-20T18:04:00Z\tMadonna\tVogue\t\tmbid-vogue\n');
});

test('search prints artist, title, listeners and MBID per track, and listeners per artist', async () => {
    const fake = startFake();
    fake.respond('track.search', {
        json: {
            results: {
                'opensearch:totalResults': '2',
                trackmatches: {
                    track: [
                        { name: 'Believe', artist: 'Cher', listeners: '99', mbid: 'mbid-believe' },
                        { name: 'Believe', artist: 'Lenny Kravitz', listeners: '7', mbid: '' },
                    ],
                },
            },
        },
    });
    fake.respond('artist.search', {
        json: {
            results: {
                'opensearch:totalResults': '1',
                artistmatches: { artist: [{ name: 'Cher', listeners: '1000', mbid: 'mbid-cher' }] },
            },
        },
    });

    const tracks = await run(fake, ['lastfm', 'search', 'track', 'Believe']);
    const artists = await run(fake, ['lastfm', 'search', 'artist', 'Cher']);

    expect(tracks).toMatchObject({ exitCode: 0, stderr: '' });
    expect(tracks.stdout).toBe('Cher\tBelieve\t99\tmbid-believe\nLenny Kravitz\tBelieve\t7\t\n');
    expect(artists.stdout).toBe('Cher\t1000\tmbid-cher\n');
});

test('user-top sends the period and prints rank, artist, title, playcount and MBID', async () => {
    const fake = startFake();
    fake.respond('user.getTopTracks', {
        json: {
            toptracks: {
                track: {
                    name: 'Believe',
                    playcount: '42',
                    mbid: '',
                    artist: { name: 'Cher', mbid: 'mbid-cher' },
                    '@attr': { rank: '1' },
                },
            },
        },
    });

    const result = await run(fake, ['lastfm', 'user-top', 'rj', 'tracks', '--period', '7day']);

    expect(result).toMatchObject({ exitCode: 0, stdout: '1\tCher\tBelieve\t42\t\n', stderr: '' });
    expect(fake.requests[0]?.query.get('period')).toBe('7day');
});

test.each<[string, string[], string, string]>([
    ['artist', ['lastfm', 'artist', 'Nobody'], 'artist.getInfo', 'Not found: artist Nobody\n'],
    ['similar-artists', ['lastfm', 'similar-artists', 'Nobody'], 'artist.getSimilar', 'Not found: artist Nobody\n'],
    ['album', ['lastfm', 'album', 'Cher', 'Nothing'], 'album.getInfo', 'Not found: album Cher - Nothing\n'],
    ['tag-top', ['lastfm', 'tag-top', 'nothing', 'tracks'], 'tag.getTopTracks', 'Not found: tag nothing\n'],
    ['user-top', ['lastfm', 'user-top', 'nobody', 'artists'], 'user.getTopArtists', 'Not found: user nobody\n'],
])('%s prints Not found to stderr, nothing to stdout, and exits 1', async (_, args, method, message) => {
    const fake = startFake();
    fake.respond(method, NOT_FOUND);

    const result = await run(fake, args);

    expect(result).toMatchObject({ exitCode: 1, stdout: '', stderr: message });
});

test.each<[string, string[], string]>([
    [
        '--limit that is not a number',
        ['similar-artists', 'Cher', '--limit', 'ten'],
        '--limit must be a positive integer',
    ],
    ['--limit of zero', ['user-recent', 'rj', '--limit', '0'], '--limit must be a positive integer'],
    ['unknown --period', ['user-top', 'rj', 'artists', '--period', 'week'], '--period must be overall, 7day'],
    ['unknown artist-top subject', ['artist-top', 'Cher', 'songs'], 'Expected tracks or albums, got songs'],
    ['unknown search subject', ['search', 'song', 'Believe'], 'Expected artist, album or track, got song'],
])('rejects %s as a usage error before calling Last.fm', async (_, args, message) => {
    const fake = startFake();

    const result = await run(fake, ['lastfm', ...args]);

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('UsageError');
    expect(result.errors).toContain(message);
    expect(fake.requests).toEqual([]);
});

test.each<[string, number, number]>([
    ['a rejected API key (error 10)', 10, 403],
    ['the rate limit (error 29)', 29, 429],
])('a Last.fm failure on %s exits 1 without printing the API key anywhere', async (_, code, status) => {
    const fake = startFake();
    fake.respond('artist.getInfo', {
        status,
        json: { error: code, message: `Request with api_key=${API_KEY} failed`, links: [] },
    });

    const result = await run(fake, ['lastfm', 'artist', 'Cher']);

    expect(fake.requests[0]?.query.get('api_key')).toBe(API_KEY);
    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('LastfmError');
    for (const output of [result.stdout, result.stderr, result.errors]) {
        expect(output).not.toContain(API_KEY);
    }
});

function startFake() {
    const fake = startFakeLastfm();
    fakes.push(fake);
    return fake;
}

/** What a command run left behind. */
interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    /** What was reported through `console.error`: logs and the failure report of `Command.catch`. */
    errors: string;
}

/** Thrown in place of a real `process.exit`; clipanion reports it to the command's stdout. */
class ProcessExited extends Error {}

/**
 * Runs the Last.fm commands in-process through clipanion, under the binary name `nzyme`, with a real
 * container holding the API key and a client pointed at the fake.
 */
async function run(fake: FakeLastfm, args: string[]): Promise<CommandResult> {
    // Plain help whatever the environment says: CI sets FORCE_COLOR.
    const cli = new Cli<CommandContext>({ binaryName: 'nzyme', enableColors: false });
    for (const command of defineLastfmCommands({ apiKey: LASTFM_API_KEY, baseUrl: fake.baseUrl })) {
        cli.register(command);
    }

    cli.register(Builtins.HelpCommand);

    const container = createContainer();
    container.set(EnvVariables, {});
    container.set(RuntimeConfig, { LASTFM_API_KEY: API_KEY });

    let errors = '';
    const exitCodes: (number | string | null | undefined)[] = [];
    const spies = [
        // Recorded, not performed: the base `Command.catch` exits 1 after reporting an error.
        spyOn(process, 'exit').mockImplementation(code => {
            exitCodes.push(code);
            throw new ProcessExited();
        }),
        spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
            errors += values.map(value => (typeof value === 'string' ? value : JSON.stringify(value))).join(' ') + '\n';
        }),
    ];

    const stdout = collect();
    const stderr = collect();
    try {
        const code = await cli.run(args, {
            container,
            stdin: Readable.from(['']),
            stdout: stdout.stream,
            stderr: stderr.stream,
        });

        const exited = exitCodes[0];
        return {
            exitCode: typeof exited === 'number' ? exited : code,
            stdout: stdout.text(),
            stderr: stderr.text(),
            errors,
        };
    } finally {
        for (const spy of spies) {
            spy.mockRestore();
        }
    }
}

function collect() {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

    return { stream, text: () => chunks.join('') };
}
