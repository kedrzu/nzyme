import { PassThrough, Readable } from 'node:stream';

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { Builtins, Cli } from 'clipanion';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineInjectable } from '@nzyme/ioc/Injectable.js';

import type { FakeTicketmaster, FakeTicketmasterHandler } from './__fixtures__/fakeTicketmaster.js';
import { startFakeTicketmaster } from './__fixtures__/fakeTicketmaster.js';
import { defineTicketmasterCommands } from './defineTicketmasterCommands.js';
import { TICKETMASTER_MUSIC_SEGMENT_ID } from './TicketmasterSegmentGet.js';
import type { TicketmasterEvent } from './TicketmasterTypes.js';

const KEY_VALUE = 'fake-key-sentinel-7f3a';

/** The consumer's key, read from the environment; resolving it when the test set none fails the command. */
const API_KEY = defineInjectable<string>({
    name: 'TicketmasterApiKey',
    resolve(container) {
        const key = container.resolve(EnvVariables).TICKETMASTER_API_KEY;
        if (!key) {
            throw new Error('The test did not set the API key');
        }

        return key;
    },
});

const VENUE = {
    id: 'KovZpZAFaJeA',
    name: 'Torwar',
    city: { name: 'Warsaw' },
    country: { name: 'Poland', countryCode: 'PL' },
    address: { line1: 'Łazienkowska 6a' },
    postalCode: '00-449',
    timezone: 'Europe/Warsaw',
};

const PRICED: TicketmasterEvent = {
    id: 'e1',
    name: 'Arctic Monkeys',
    url: 'https://tm.example/e1',
    dates: { start: { localDate: '2026-12-01', localTime: '19:30:00' }, status: { code: 'onsale' } },
    priceRanges: [
        { type: 'vip', currency: 'PLN', min: 500, max: 500 },
        { type: 'standard', currency: 'PLN', min: 149.5, max: 299 },
    ],
    _embedded: { venues: [VENUE] },
};

const UNPRICED: TicketmasterEvent = {
    id: 'e2',
    name: 'Dawid Podsiadło',
    url: 'https://tm.example/e2',
    dates: { start: { localDate: '2026-12-05', localTime: '20:00:00' }, status: { code: 'offsale' } },
    _embedded: { venues: [VENUE] },
};

/** On the day before `--from`: inside the widened UTC window, outside the local dates. */
const EDGE: TicketmasterEvent = {
    id: 'e3',
    name: 'Too Early',
    dates: { start: { localDate: '2026-11-30', localTime: '23:00:00' }, status: { code: 'onsale' } },
};

const fakes: FakeTicketmaster[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(fake => fake.stop()));
});

test('--help lists the five commands without an API key', async () => {
    const result = await run({ args: ['--help'], baseUrl: 'http://127.0.0.1:1/', key: false });

    expect(result.exitCode).toBe(0);
    const listed = [...result.stdout.matchAll(/^\s+nzyme ticketmaster ([a-z]+)\b/gm)].map(match => match[1]);
    expect(listed.toSorted()).toEqual(['attractions', 'classifications', 'event', 'events', 'venues']);
});

describe('events', () => {
    test('sends one request with the query and prints the events within the local dates', async () => {
        const fake = start({
            '/discovery/v2/events.json': () =>
                Response.json({
                    _embedded: { events: [EDGE, PRICED, UNPRICED] },
                    page: { size: 20, totalElements: 3, totalPages: 1, number: 0 },
                }),
        });

        const result = await run({
            args: [
                'ticketmaster',
                'events',
                '--country',
                'PL',
                '--city',
                'Warsaw',
                '--from',
                '2026-12-01',
                '--to',
                '2026-12-05',
                '--genre',
                'Rock',
                '--size',
                '20',
                '--page',
                '0',
            ],
            baseUrl: fake.baseUrl,
        });

        expect(result.exitCode).toBe(0);
        expect(fake.requests).toHaveLength(1);
        const [request] = fake.requests;
        expect(request?.path).toBe('/discovery/v2/events.json');
        expect(Object.fromEntries(request?.query ?? [])).toEqual({
            apikey: KEY_VALUE,
            locale: '*',
            countryCode: 'PL',
            city: 'Warsaw',
            startDateTime: '2026-11-30T00:00:00Z',
            endDateTime: '2026-12-06T23:59:59Z',
            classificationName: 'Rock',
            segmentName: 'Music',
            size: '20',
            page: '0',
            sort: 'date,asc',
        });
        expect(result.stdout).toBe(
            'e1\t2026-12-01\t19:30\tArctic Monkeys\tTorwar\tWarsaw\tPL\t149.5–299 PLN\tonsale\thttps://tm.example/e1\n' +
                'e2\t2026-12-05\t20:00\tDawid Podsiadło\tTorwar\tWarsaw\tPL\t\toffsale\thttps://tm.example/e2\n' +
                '# page 1/1, 3 events\n',
        );
    });

    test('--near is sent as a geohash, --radius-km as km, --segment all omits the segment', async () => {
        const fake = start({ '/discovery/v2/events.json': () => Response.json({}) });

        const result = await run({
            args: ['ticketmaster', 'events', '--near', '57.64911,10.40744', '--radius-km', '25', '--segment', 'all'],
            baseUrl: fake.baseUrl,
        });

        expect(result.exitCode).toBe(0);
        const query = fake.requests[0]?.query;
        expect(query?.get('geoPoint')).toBe('u4pruydqq');
        expect(query?.get('radius')).toBe('25');
        expect(query?.get('unit')).toBe('km');
        expect(query?.has('segmentName')).toBe(false);
        expect(result.stdout).toBe('# 0 events\n');
    });

    test('--size above 200 is capped to 200', async () => {
        const fake = start({ '/discovery/v2/events.json': () => Response.json({}) });

        const result = await run({ args: ['ticketmaster', 'events', '--size', '500'], baseUrl: fake.baseUrl });

        expect(result.exitCode).toBe(0);
        expect(fake.requests[0]?.query.get('size')).toBe('200');
    });

    test.each([
        ['size * page at the paging window', ['--size', '200', '--page', '5']],
        ['a capped size beyond the paging window', ['--size', '500', '--page', '5']],
        ['--radius-km without a location', ['--radius-km', '10']],
        ['--near out of range', ['--near', '91,10']],
        ['--near with one number', ['--near', '52.2']],
        ['a non-positive radius', ['--city', 'Warsaw', '--radius-km', '0']],
        ['an impossible date', ['--from', '2026-02-30']],
        ['--from after --to', ['--from', '2026-12-02', '--to', '2026-12-01']],
        ['a negative page', ['--page', '-1']],
    ])('rejects %s before any request', async (_name, options) => {
        const fake = start({ '/discovery/v2/events.json': () => Response.json({}) });

        const result = await run({ args: ['ticketmaster', 'events', ...options], baseUrl: fake.baseUrl });

        expect(result.exitCode).toBe(1);
        expect(fake.requests).toHaveLength(0);
    });
});

describe('event', () => {
    test('prints the header block of a found event', async () => {
        const fake = start({
            '/discovery/v2/events/e1.json': () =>
                Response.json({
                    ...PRICED,
                    info: 'Doors at 18:00',
                    pleaseNote: 'No cameras',
                    dates: { ...PRICED.dates, timezone: 'Europe/Warsaw' },
                    classifications: [
                        {
                            segment: { id: 's', name: 'Music' },
                            genre: { id: 'g', name: 'Rock' },
                            subGenre: { id: 'sg', name: 'Rock' },
                        },
                    ],
                    sales: {
                        public: { startDateTime: '2026-06-01T08:00:00Z', endDateTime: '2026-12-01T18:00:00Z' },
                        presales: [
                            { name: 'Fan', startDateTime: '2026-05-28T08:00:00Z', endDateTime: '2026-05-31T22:00:00Z' },
                        ],
                    },
                    _embedded: { venues: [VENUE], attractions: [{ id: 'K8vZ9171ob7', name: 'Arctic Monkeys' }] },
                }),
        });

        const result = await run({ args: ['ticketmaster', 'event', 'e1'], baseUrl: fake.baseUrl });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe(
            [
                'name: Arctic Monkeys',
                'id: e1',
                'date: 2026-12-01',
                'time: 19:30',
                'timezone: Europe/Warsaw',
                'status: onsale',
                'venue: Torwar',
                'address: Łazienkowska 6a, 00-449 Warsaw, Poland',
                'attractions: Arctic Monkeys (K8vZ9171ob7)',
                'genre: Music / Rock',
                'prices: vip 500 PLN; standard 149.5–299 PLN',
                'public sale: 2026-06-01T08:00:00Z – 2026-12-01T18:00:00Z',
                'presales: Fan: 2026-05-28T08:00:00Z – 2026-05-31T22:00:00Z',
                'url: https://tm.example/e1',
                'info: Doors at 18:00',
                'please note: No cameras',
                '',
            ].join('\n'),
        );
    });

    test('a missing event fails naming the id', async () => {
        const fake = start({});

        const result = await run({ args: ['ticketmaster', 'event', 'nope123'], baseUrl: fake.baseUrl });

        expect(result.exitCode).toBe(1);
        expect(result.errors).toContain('Event nope123 not found.');
    });
});

test('attractions prints Spotify and MusicBrainz links when present and none when absent', async () => {
    const fake = start({
        '/discovery/v2/attractions.json': () =>
            Response.json({
                _embedded: {
                    attractions: [
                        {
                            id: 'K8vZ9171ob7',
                            name: 'Arctic Monkeys',
                            classifications: [{ genre: { id: 'g', name: 'Rock' } }],
                            upcomingEvents: { _total: 12 },
                            externalLinks: {
                                spotify: [{ url: 'https://open.spotify.com/artist/7Ln80lUS6He07XvHI8qqHH' }],
                                musicbrainz: [{ id: 'ada7a83c-e3e1-40f1-93f9-3e73dbc9298a' }],
                                homepage: [{ url: 'https://arcticmonkeys.com' }],
                                twitter: [],
                            },
                        },
                        { id: 'K8vZ917_unknown', name: 'Arctic Tribute' },
                    ],
                },
                page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
            }),
    });

    const result = await run({ args: ['ticketmaster', 'attractions', 'arctic monkeys'], baseUrl: fake.baseUrl });

    expect(result.exitCode).toBe(0);
    expect(fake.requests[0]?.query.get('keyword')).toBe('arctic monkeys');
    expect(fake.requests[0]?.query.has('segmentName')).toBe(false);
    expect(result.stdout).toBe(
        'K8vZ9171ob7\tArctic Monkeys\tRock\t12\t' +
            'spotify=https://open.spotify.com/artist/7Ln80lUS6He07XvHI8qqHH ' +
            'musicbrainz=ada7a83c-e3e1-40f1-93f9-3e73dbc9298a homepage=https://arcticmonkeys.com\n' +
            'K8vZ917_unknown\tArctic Tribute\t\t\t\n' +
            '# page 1/1, 2 attractions\n',
    );
});

test('venues prints one line per venue', async () => {
    const fake = start({
        '/discovery/v2/venues.json': () =>
            Response.json({
                _embedded: { venues: [{ ...VENUE, upcomingEvents: { _total: 4 } }] },
                page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
            }),
    });

    const result = await run({ args: ['ticketmaster', 'venues', 'torwar', '--country', 'PL'], baseUrl: fake.baseUrl });

    expect(result.exitCode).toBe(0);
    expect(fake.requests[0]?.query.get('countryCode')).toBe('PL');
    expect(result.stdout).toBe('KovZpZAFaJeA\tTorwar\tWarsaw\tPL\tŁazienkowska 6a\t4\n# page 1/1, 1 venue\n');
});

test('classifications lists the genres of the music segment', async () => {
    const fake = start({
        [`/discovery/v2/classifications/segments/${TICKETMASTER_MUSIC_SEGMENT_ID}.json`]: () =>
            Response.json({
                id: TICKETMASTER_MUSIC_SEGMENT_ID,
                name: 'Music',
                _embedded: {
                    genres: [
                        { id: 'KnvZfZ7vAeA', name: 'Rock' },
                        { id: 'KnvZfZ7vAvF', name: 'Jazz' },
                    ],
                },
            }),
    });

    const result = await run({
        args: ['ticketmaster', 'classifications', '--segment', 'Music'],
        baseUrl: fake.baseUrl,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('KnvZfZ7vAeA\tRock\nKnvZfZ7vAvF\tJazz\n');
});

describe('the API key never reaches the output', () => {
    test.each([
        ['401', 401, 'rejected the API key'],
        ['429', 429, 'rate limit exceeded'],
    ])('on a %s', async (_name, status, message) => {
        const fake = start({
            '/discovery/v2/events.json': request =>
                new Response(`bad apikey=${request.query.get('apikey')}`, { status }),
        });

        const result = await run({ args: ['ticketmaster', 'events'], baseUrl: fake.baseUrl });

        expect(fake.requests[0]?.query.get('apikey')).toBe(KEY_VALUE);
        expect(result.exitCode).toBe(1);
        expect(result.errors).toContain(message);
        expectNoKey(result);
    });

    test('on a network failure', async () => {
        const closed = startFakeTicketmaster({});
        const { baseUrl } = closed;
        await closed.stop();

        const result = await run({ args: ['ticketmaster', 'events'], baseUrl });

        expect(result.exitCode).toBe(1);
        expect(result.errors).toContain('Could not reach Ticketmaster');
        expectNoKey(result);
    });
});

function expectNoKey(result: CommandResult) {
    expect(result.stdout).not.toContain(KEY_VALUE);
    expect(result.stderr).not.toContain(KEY_VALUE);
    expect(result.errors).not.toContain(KEY_VALUE);
}

function start(handlers: Record<string, FakeTicketmasterHandler>) {
    const fake = startFakeTicketmaster(handlers);
    fakes.push(fake);
    return fake;
}

/** Options of {@link run}. */
interface RunOptions {
    args: string[];
    baseUrl: string;
    /** Whether the container holds the API key; true by default. */
    key?: boolean;
}

/** What a command run left behind. */
interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    /** What was reported through `console.error`: logs and the failure report. */
    errors: string;
}

/** Thrown in place of a real `process.exit`. */
class ProcessExited extends Error {}

/** Runs the Ticketmaster commands in-process through clipanion, under the binary name `nzyme`. */
async function run(options: RunOptions): Promise<CommandResult> {
    const cli = new Cli<CommandContext>({ binaryName: 'nzyme', enableColors: false });
    for (const command of defineTicketmasterCommands({ apiKey: API_KEY, baseUrl: options.baseUrl })) {
        cli.register(command);
    }

    cli.register(Builtins.HelpCommand);

    const container = createContainer();
    container.set(EnvVariables, options.key === false ? {} : { TICKETMASTER_API_KEY: KEY_VALUE });

    let errors = '';
    const exitCodes: (number | string | null | undefined)[] = [];
    const spies = [
        // Recorded, not performed: the base `Command.catch` exits 1 after reporting an error.
        spyOn(process, 'exit').mockImplementation(code => {
            exitCodes.push(code);
            throw new ProcessExited();
        }),
        spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            errors += args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ') + '\n';
        }),
    ];

    const stdout = collect();
    const stderr = collect();
    try {
        const code = await cli.run(options.args, {
            container,
            stdin: Readable.from(['']),
            stdout: stdout.stream,
            stderr: stderr.stream,
        });
        const [exited] = exitCodes;
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
