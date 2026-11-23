import { afterEach, expect, test } from 'bun:test';

import { RuntimeConfig } from '@nzyme/config/RuntimeConfig.js';
import type { Endpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

import { startFakeLastfm } from './__fixtures__/fakeLastfm.js';
import type { FakeLastfm } from './__fixtures__/fakeLastfm.js';
import { defineLastfmClient } from './defineLastfmClient.js';
import { LastfmAlbumGetInfo } from './LastfmAlbumGetInfo.js';
import type { LastfmAlbumGetInfoResult } from './LastfmAlbumGetInfo.js';
import { LastfmAlbumSearch } from './LastfmAlbumSearch.js';
import { LastfmArtistGetInfo } from './LastfmArtistGetInfo.js';
import type { LastfmArtistGetInfoResult } from './LastfmArtistGetInfo.js';
import { LastfmArtistGetSimilar } from './LastfmArtistGetSimilar.js';
import type { LastfmArtistGetSimilarResult } from './LastfmArtistGetSimilar.js';
import { LastfmArtistGetTopAlbums } from './LastfmArtistGetTopAlbums.js';
import { LastfmArtistGetTopTracks } from './LastfmArtistGetTopTracks.js';
import type { LastfmArtistGetTopTracksResult } from './LastfmArtistGetTopTracks.js';
import { LastfmArtistSearch } from './LastfmArtistSearch.js';
import { LastfmChartGetTopArtists } from './LastfmChartGetTopArtists.js';
import { LastfmChartGetTopTags } from './LastfmChartGetTopTags.js';
import type { LastfmChartGetTopTagsResult } from './LastfmChartGetTopTags.js';
import { LastfmChartGetTopTracks } from './LastfmChartGetTopTracks.js';
import { LastfmError } from './LastfmError.js';
import type { LastfmErrorOptions } from './LastfmError.js';
import { LastfmTagGetInfo } from './LastfmTagGetInfo.js';
import { LastfmTagGetTopAlbums } from './LastfmTagGetTopAlbums.js';
import { LastfmTagGetTopArtists } from './LastfmTagGetTopArtists.js';
import type { LastfmTagGetTopArtistsResult } from './LastfmTagGetTopArtists.js';
import { LastfmTagGetTopTracks } from './LastfmTagGetTopTracks.js';
import { LastfmTrackGetInfo } from './LastfmTrackGetInfo.js';
import type { LastfmTrackGetInfoResult } from './LastfmTrackGetInfo.js';
import { LastfmTrackGetSimilar } from './LastfmTrackGetSimilar.js';
import { LastfmTrackSearch } from './LastfmTrackSearch.js';
import type { LastfmTrackSearchResult } from './LastfmTrackSearch.js';
import { LastfmUserGetRecentTracks } from './LastfmUserGetRecentTracks.js';
import type { LastfmUserGetRecentTracksResult } from './LastfmUserGetRecentTracks.js';
import { LastfmUserGetTopAlbums } from './LastfmUserGetTopAlbums.js';
import { LastfmUserGetTopArtists } from './LastfmUserGetTopArtists.js';
import type { LastfmUserGetTopArtistsResult } from './LastfmUserGetTopArtists.js';
import { LastfmUserGetTopTracks } from './LastfmUserGetTopTracks.js';

const LASTFM_API_KEY = defineSecret('LASTFM_API_KEY');
const NOT_FOUND = { json: { error: 6, message: 'Not found', links: [] } };

const fakes: FakeLastfm[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(fake => fake.stop()));
});

/** One endpoint call: the endpoint, its params, and the query it must send (`api_key` and `format` aside). */
type QueryCase = [string, EndpointCall, Record<string, string>];

/** An endpoint bound to its params, waiting for a fake to run against. */
type EndpointCall = (fake: FakeLastfm) => Promise<unknown>;

test.each<QueryCase>([
    [
        'artist.getSimilar by name',
        call(LastfmArtistGetSimilar, { artist: 'Cher', limit: 10 }),
        { method: 'artist.getSimilar', artist: 'Cher', autocorrect: '1', limit: '10' },
    ],
    [
        'artist.getSimilar by mbid',
        call(LastfmArtistGetSimilar, { mbid: 'mbid-cher' }),
        { method: 'artist.getSimilar', mbid: 'mbid-cher' },
    ],
    [
        'artist.getInfo by name',
        call(LastfmArtistGetInfo, { artist: 'Cher', lang: 'pl' }),
        { method: 'artist.getInfo', artist: 'Cher', autocorrect: '1', lang: 'pl' },
    ],
    [
        'artist.getTopTracks by mbid',
        call(LastfmArtistGetTopTracks, { mbid: 'mbid-cher', limit: 5, page: 2 }),
        { method: 'artist.getTopTracks', mbid: 'mbid-cher', limit: '5', page: '2' },
    ],
    [
        'artist.getTopAlbums by name',
        call(LastfmArtistGetTopAlbums, { artist: 'Cher' }),
        { method: 'artist.getTopAlbums', artist: 'Cher', autocorrect: '1' },
    ],
    [
        'artist.search',
        call(LastfmArtistSearch, { artist: 'Cher', limit: 3, page: 1 }),
        { method: 'artist.search', artist: 'Cher', limit: '3', page: '1' },
    ],
    [
        'album.getInfo by name',
        call(LastfmAlbumGetInfo, { artist: 'Cher', album: 'Believe' }),
        { method: 'album.getInfo', artist: 'Cher', album: 'Believe', autocorrect: '1' },
    ],
    [
        'album.getInfo by mbid',
        call(LastfmAlbumGetInfo, { mbid: 'mbid-believe' }),
        { method: 'album.getInfo', mbid: 'mbid-believe' },
    ],
    ['album.search', call(LastfmAlbumSearch, { album: 'Believe' }), { method: 'album.search', album: 'Believe' }],
    [
        'track.getSimilar by name',
        call(LastfmTrackGetSimilar, { artist: 'Cher', track: 'Believe', limit: 20 }),
        { method: 'track.getSimilar', artist: 'Cher', track: 'Believe', autocorrect: '1', limit: '20' },
    ],
    [
        'track.getInfo by name',
        call(LastfmTrackGetInfo, { artist: 'Cher', track: 'Believe' }),
        { method: 'track.getInfo', artist: 'Cher', track: 'Believe', autocorrect: '1' },
    ],
    [
        'track.getInfo by mbid',
        call(LastfmTrackGetInfo, { mbid: 'mbid-track' }),
        { method: 'track.getInfo', mbid: 'mbid-track' },
    ],
    [
        'track.search',
        call(LastfmTrackSearch, { track: 'Believe', artist: 'Cher', page: 2 }),
        { method: 'track.search', track: 'Believe', artist: 'Cher', page: '2' },
    ],
    ['tag.getInfo', call(LastfmTagGetInfo, { tag: 'disco' }), { method: 'tag.getInfo', tag: 'disco' }],
    [
        'tag.getTopArtists',
        call(LastfmTagGetTopArtists, { tag: 'disco', limit: 10, page: 3 }),
        { method: 'tag.getTopArtists', tag: 'disco', limit: '10', page: '3' },
    ],
    ['tag.getTopAlbums', call(LastfmTagGetTopAlbums, { tag: 'disco' }), { method: 'tag.getTopAlbums', tag: 'disco' }],
    ['tag.getTopTracks', call(LastfmTagGetTopTracks, { tag: 'disco' }), { method: 'tag.getTopTracks', tag: 'disco' }],
    [
        'chart.getTopArtists',
        call(LastfmChartGetTopArtists, { limit: 5 }),
        { method: 'chart.getTopArtists', limit: '5' },
    ],
    ['chart.getTopTracks', call(LastfmChartGetTopTracks, { page: 2 }), { method: 'chart.getTopTracks', page: '2' }],
    ['chart.getTopTags', call(LastfmChartGetTopTags, {}), { method: 'chart.getTopTags' }],
    [
        'user.getTopArtists',
        call(LastfmUserGetTopArtists, { user: 'rj', period: '7day', limit: 10, page: 2 }),
        { method: 'user.getTopArtists', user: 'rj', period: '7day', limit: '10', page: '2' },
    ],
    [
        'user.getTopTracks',
        call(LastfmUserGetTopTracks, { user: 'rj', period: '12month' }),
        { method: 'user.getTopTracks', user: 'rj', period: '12month' },
    ],
    ['user.getTopAlbums', call(LastfmUserGetTopAlbums, { user: 'rj' }), { method: 'user.getTopAlbums', user: 'rj' }],
    [
        'user.getRecentTracks',
        call(LastfmUserGetRecentTracks, {
            user: 'rj',
            limit: 200,
            from: new Date('2023-11-14T22:13:20Z'),
            to: new Date('2023-11-15T00:00:00.900Z'),
        }),
        { method: 'user.getRecentTracks', user: 'rj', limit: '200', from: '1700000000', to: '1700006400' },
    ],
])('%s sends its params under the Last.fm query names', async (_, send, expected) => {
    const fake = startFake();

    // The fake answers an unprimed method with an error: only the query is asserted.
    await send(fake).catch(() => null);

    const query = Object.fromEntries(fake.requests[0]!.query);
    expect({ ...query, api_key: undefined, format: undefined }).toEqual({
        ...expected,
        api_key: undefined,
        format: undefined,
    });
});

test.each<[string, EndpointCall]>([
    ['artist.getSimilar', call(LastfmArtistGetSimilar, { artist: 'Nobody' })],
    ['artist.getInfo', call(LastfmArtistGetInfo, { artist: 'Nobody' })],
    ['artist.getTopTracks', call(LastfmArtistGetTopTracks, { artist: 'Nobody' })],
    ['artist.getTopAlbums', call(LastfmArtistGetTopAlbums, { artist: 'Nobody' })],
    ['album.getInfo', call(LastfmAlbumGetInfo, { artist: 'Nobody', album: 'Nothing' })],
    ['track.getSimilar', call(LastfmTrackGetSimilar, { artist: 'Nobody', track: 'Nothing' })],
    ['track.getInfo', call(LastfmTrackGetInfo, { artist: 'Nobody', track: 'Nothing' })],
    ['tag.getInfo', call(LastfmTagGetInfo, { tag: 'nothing' })],
    ['tag.getTopArtists', call(LastfmTagGetTopArtists, { tag: 'nothing' })],
    ['tag.getTopAlbums', call(LastfmTagGetTopAlbums, { tag: 'nothing' })],
    ['tag.getTopTracks', call(LastfmTagGetTopTracks, { tag: 'nothing' })],
    ['user.getTopArtists', call(LastfmUserGetTopArtists, { user: 'nobody' })],
    ['user.getTopTracks', call(LastfmUserGetTopTracks, { user: 'nobody' })],
    ['user.getTopAlbums', call(LastfmUserGetTopAlbums, { user: 'nobody' })],
    ['user.getRecentTracks', call(LastfmUserGetRecentTracks, { user: 'nobody' })],
])('%s returns null when Last.fm does not know what was looked up', async (method, send) => {
    const fake = startFake();
    fake.respond(method, NOT_FOUND);

    expect(await send(fake)).toBeNull();
});

test.each<[string, EndpointCall]>([
    ['artist.search', call(LastfmArtistSearch, { artist: 'Cher' })],
    ['album.search', call(LastfmAlbumSearch, { album: 'Believe' })],
    ['track.search', call(LastfmTrackSearch, { track: 'Believe' })],
    ['chart.getTopArtists', call(LastfmChartGetTopArtists, {})],
    ['chart.getTopTracks', call(LastfmChartGetTopTracks, {})],
    ['chart.getTopTags', call(LastfmChartGetTopTags, {})],
])('%s throws on error 6, never returns null', async (method, send) => {
    const fake = startFake();
    fake.respond(method, NOT_FOUND);

    const error = await send(fake).catch((thrown: unknown) => thrown);

    const expected: LastfmErrorOptions = { method, code: 6, status: 200 };
    expect(error).toBeInstanceOf(LastfmError);
    expect(error).toMatchObject(expected);
});

test('artist.getSimilar reads numeric strings, empty MBIDs, the resolved name, and skips nameless items', async () => {
    const fake = startFake();
    fake.respond('artist.getSimilar', {
        json: {
            similarartists: {
                artist: [
                    { name: 'Madonna', mbid: 'mbid-madonna', match: '0.98', url: 'https://last.fm/Madonna', image: [] },
                    { name: 'Sonny & Cher', mbid: '', match: 0.5, url: 'https://last.fm/Sonny', streamable: '0' },
                    { name: '', mbid: 'mbid-blank', match: '0.4', url: 'https://last.fm/blank' },
                    { mbid: 'mbid-nameless', match: '0.3' },
                ],
                '@attr': { artist: 'Cher' },
            },
        },
    });

    const result = await run(fake, LastfmArtistGetSimilar, { artist: 'cher' });

    const expected: LastfmArtistGetSimilarResult = {
        artist: 'Cher',
        items: [
            { name: 'Madonna', mbid: 'mbid-madonna', url: 'https://last.fm/Madonna', match: 0.98 },
            { name: 'Sonny & Cher', mbid: null, url: 'https://last.fm/Sonny', match: 0.5 },
        ],
    };
    expect(result).toEqual(expected);
});

test('artist.getTopTracks reads @attr ranks and nested artists', async () => {
    const fake = startFake();
    fake.respond('artist.getTopTracks', {
        json: {
            toptracks: {
                track: [
                    {
                        name: 'Believe',
                        playcount: '1000',
                        listeners: '200',
                        mbid: '',
                        url: 'https://last.fm/Believe',
                        artist: { name: 'Cher', mbid: 'mbid-cher', url: 'https://last.fm/Cher' },
                        '@attr': { rank: '1' },
                    },
                ],
                '@attr': { artist: 'Cher', page: '1', perPage: '50', totalPages: '1', total: '1' },
            },
        },
    });

    const result = await run(fake, LastfmArtistGetTopTracks, { artist: 'Cher' });

    const expected: LastfmArtistGetTopTracksResult = {
        artist: 'Cher',
        items: [
            {
                name: 'Believe',
                mbid: null,
                url: 'https://last.fm/Believe',
                artist: { name: 'Cher', mbid: 'mbid-cher', url: 'https://last.fm/Cher' },
                rank: 1,
                playcount: 1000,
                listeners: 200,
            },
        ],
    };
    expect(result).toEqual(expected);
});

test('artist.getInfo reads stats, similar artists, tags and the bio summary', async () => {
    const fake = startFake();
    fake.respond('artist.getInfo', {
        json: {
            artist: {
                name: 'Cher',
                mbid: 'mbid-cher',
                url: 'https://last.fm/Cher',
                stats: { listeners: '123', playcount: '456' },
                similar: { artist: { name: 'Madonna', url: 'https://last.fm/Madonna', image: [] } },
                tags: { tag: [{ name: 'pop', url: 'https://last.fm/tag/pop' }] },
                bio: { published: '01 Jan 2000', summary: 'Cher is a singer.', content: 'Cher is a singer. More.' },
            },
        },
    });

    const result = await run(fake, LastfmArtistGetInfo, { artist: 'Cher' });

    const expected: LastfmArtistGetInfoResult = {
        name: 'Cher',
        mbid: 'mbid-cher',
        url: 'https://last.fm/Cher',
        listeners: 123,
        playcount: 456,
        similar: [{ name: 'Madonna', mbid: null, url: 'https://last.fm/Madonna' }],
        tags: [{ name: 'pop', url: 'https://last.fm/tag/pop' }],
        summary: 'Cher is a singer.',
    };
    expect(result).toEqual(expected);
});

test('album.getInfo reads a one-track list given as an object, an empty "" tag list and a missing wiki', async () => {
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
                    track: {
                        name: 'Believe',
                        url: 'https://last.fm/Cher/_/Believe',
                        duration: null,
                        '@attr': { rank: 1 },
                        artist: { name: 'Cher', mbid: 'mbid-cher', url: 'https://last.fm/Cher' },
                    },
                },
                tags: '',
            },
        },
    });

    const result = await run(fake, LastfmAlbumGetInfo, { artist: 'Cher', album: 'Believe' });

    const expected: LastfmAlbumGetInfoResult = {
        name: 'Believe',
        artist: { name: 'Cher', mbid: null, url: null },
        mbid: null,
        url: 'https://last.fm/Cher/Believe',
        listeners: 10,
        playcount: 20,
        tracks: [
            {
                name: 'Believe',
                mbid: null,
                url: 'https://last.fm/Cher/_/Believe',
                artist: { name: 'Cher', mbid: 'mbid-cher', url: 'https://last.fm/Cher' },
                rank: 1,
                duration: null,
            },
        ],
        tags: [],
        summary: null,
    };
    expect(result).toEqual(expected);
});

test('album.getInfo without a track list has no tracks', async () => {
    const fake = startFake();
    fake.respond('album.getInfo', { json: { album: { name: 'Believe', artist: 'Cher', url: 'u' } } });

    const result = await run(fake, LastfmAlbumGetInfo, { mbid: 'mbid-believe' });

    expect(result?.tracks).toEqual([]);
});

test('track.getInfo turns its millisecond duration into seconds and reads the album and tags', async () => {
    const fake = startFake();
    fake.respond('track.getInfo', {
        json: {
            track: {
                name: 'Believe',
                mbid: 'mbid-track',
                url: 'https://last.fm/Cher/_/Believe',
                duration: '239000',
                listeners: '1',
                playcount: '2',
                artist: { name: 'Cher', mbid: 'mbid-cher', url: 'https://last.fm/Cher' },
                album: {
                    artist: 'Cher',
                    title: 'Believe',
                    mbid: '',
                    url: 'https://last.fm/Cher/Believe',
                    '@attr': { position: '1' },
                },
                toptags: { tag: { name: 'pop', url: 'https://last.fm/tag/pop' } },
                wiki: { summary: 'A song.', content: 'A song. More.' },
            },
        },
    });

    const result = await run(fake, LastfmTrackGetInfo, { artist: 'Cher', track: 'Believe' });

    const expected: LastfmTrackGetInfoResult = {
        name: 'Believe',
        mbid: 'mbid-track',
        url: 'https://last.fm/Cher/_/Believe',
        artist: { name: 'Cher', mbid: 'mbid-cher', url: 'https://last.fm/Cher' },
        duration: 239,
        listeners: 1,
        playcount: 2,
        album: { name: 'Believe', mbid: null, url: 'https://last.fm/Cher/Believe' },
        tags: [{ name: 'pop', url: 'https://last.fm/tag/pop' }],
        summary: 'A song.',
    };
    expect(result).toEqual(expected);
});

test('track.getInfo with an unknown duration and no album has nulls for both', async () => {
    const fake = startFake();
    fake.respond('track.getInfo', {
        json: { track: { name: 'Believe', duration: '0', artist: { name: 'Cher' } } },
    });

    const result = await run(fake, LastfmTrackGetInfo, { mbid: 'mbid-track' });

    expect(result).toMatchObject({ duration: null, album: null });
});

test('track.search reads the total and artists given only by name', async () => {
    const fake = startFake();
    fake.respond('track.search', {
        json: {
            results: {
                'opensearch:totalResults': '1234',
                trackmatches: {
                    track: { name: 'Believe', artist: 'Cher', url: 'https://last.fm/b', listeners: '99', mbid: '' },
                },
            },
        },
    });

    const result = await run(fake, LastfmTrackSearch, { track: 'Believe' });

    const expected: LastfmTrackSearchResult = {
        total: 1234,
        items: [
            {
                name: 'Believe',
                mbid: null,
                url: 'https://last.fm/b',
                artist: { name: 'Cher', mbid: null, url: null },
                listeners: 99,
            },
        ],
    };
    expect(result).toEqual(expected);
});

test.each<[string, unknown]>([
    ['missing', { topartists: {} }],
    ['an empty string', { topartists: { artist: '' } }],
])('tag.getTopArtists with the list %s has no items', async (_, json) => {
    const fake = startFake();
    fake.respond('tag.getTopArtists', { json });

    const result = await run(fake, LastfmTagGetTopArtists, { tag: 'disco' });

    const expected: LastfmTagGetTopArtistsResult = { items: [] };
    expect(result).toEqual(expected);
});

test('user.getTopArtists reads a one-item list given as an object', async () => {
    const fake = startFake();
    fake.respond('user.getTopArtists', {
        json: {
            topartists: {
                artist: { name: 'Cher', playcount: '42', mbid: 'mbid-cher', url: 'u', '@attr': { rank: '3' } },
                '@attr': { user: 'rj' },
            },
        },
    });

    const result = await run(fake, LastfmUserGetTopArtists, { user: 'rj' });

    const expected: LastfmUserGetTopArtistsResult = {
        items: [{ name: 'Cher', mbid: 'mbid-cher', url: 'u', rank: 3, playcount: 42 }],
    };
    expect(result).toEqual(expected);
});

test('chart.getTopTags reads reach and taggings', async () => {
    const fake = startFake();
    fake.respond('chart.getTopTags', {
        json: { tags: { tag: [{ name: 'rock', url: 'https://last.fm/tag/rock', reach: '1', taggings: '2' }] } },
    });

    const result = await run(fake, LastfmChartGetTopTags, {});

    const expected: LastfmChartGetTopTagsResult = {
        items: [{ name: 'rock', url: 'https://last.fm/tag/rock', reach: 1, taggings: 2 }],
    };
    expect(result).toEqual(expected);
});

test('user.getRecentTracks reads #text artists and albums, the play time and the now-playing track', async () => {
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
                        url: 'https://last.fm/Cher/_/Believe',
                        '@attr': { nowplaying: 'true' },
                    },
                    {
                        artist: { '#text': 'Madonna', mbid: '' },
                        name: 'Vogue',
                        mbid: 'mbid-vogue',
                        album: { '#text': '', mbid: '' },
                        url: 'https://last.fm/Madonna/_/Vogue',
                        date: { uts: '1700000000', '#text': '14 Nov 2023, 22:13' },
                    },
                ],
                '@attr': { user: 'rj' },
            },
        },
    });

    const result = await run(fake, LastfmUserGetRecentTracks, { user: 'rj' });

    const expected: LastfmUserGetRecentTracksResult = {
        items: [
            {
                name: 'Believe',
                mbid: null,
                url: 'https://last.fm/Cher/_/Believe',
                artist: { name: 'Cher', mbid: 'mbid-cher', url: null },
                album: { name: 'Believe', mbid: 'mbid-believe' },
                playedAt: null,
                nowPlaying: true,
            },
            {
                name: 'Vogue',
                mbid: 'mbid-vogue',
                url: 'https://last.fm/Madonna/_/Vogue',
                artist: { name: 'Madonna', mbid: null, url: null },
                album: null,
                playedAt: new Date('2023-11-14T22:13:20Z'),
                nowPlaying: false,
            },
        ],
    };
    expect(result).toEqual(expected);
});

const CHER = { name: 'Cher', mbid: 'mbid-cher', url: 'https://last.fm/Cher' };

test.each<[string, ParseCase]>([
    [
        'artist.getTopAlbums',
        parseCase(
            'artist.getTopAlbums',
            LastfmArtistGetTopAlbums,
            { artist: 'Cher' },
            {
                topalbums: {
                    album: { name: 'Believe', playcount: 123, mbid: '', url: 'u', artist: CHER, image: [] },
                    '@attr': { artist: 'Cher' },
                },
            },
            {
                artist: 'Cher',
                items: [{ name: 'Believe', mbid: null, url: 'u', artist: CHER, playcount: 123 }],
            },
        ),
    ],
    [
        'album.search',
        parseCase(
            'album.search',
            LastfmAlbumSearch,
            { album: 'Believe' },
            {
                results: {
                    'opensearch:totalResults': '7',
                    albummatches: { album: { name: 'Believe', artist: 'Cher', url: 'u', mbid: 'mbid-believe' } },
                },
            },
            {
                total: 7,
                items: [
                    {
                        name: 'Believe',
                        mbid: 'mbid-believe',
                        url: 'u',
                        artist: { name: 'Cher', mbid: null, url: null },
                    },
                ],
            },
        ),
    ],
    [
        'track.getSimilar',
        parseCase(
            'track.getSimilar',
            LastfmTrackGetSimilar,
            { artist: 'Cher', track: 'Believe' },
            {
                similartracks: {
                    track: [
                        { name: 'Vogue', playcount: 50, mbid: '', match: 0.75, url: 'u', duration: 0, artist: CHER },
                        {
                            name: 'Strong Enough',
                            playcount: '9',
                            mbid: 'm',
                            match: '0.5',
                            url: 'v',
                            duration: '220',
                            artist: CHER,
                        },
                    ],
                    '@attr': { artist: 'Cher' },
                },
            },
            {
                artist: 'Cher',
                items: [
                    {
                        name: 'Vogue',
                        mbid: null,
                        url: 'u',
                        artist: CHER,
                        match: 0.75,
                        playcount: 50,
                        duration: null,
                    },
                    {
                        name: 'Strong Enough',
                        mbid: 'm',
                        url: 'v',
                        artist: CHER,
                        match: 0.5,
                        playcount: 9,
                        duration: 220,
                    },
                ],
            },
        ),
    ],
    [
        'tag.getInfo',
        parseCase(
            'tag.getInfo',
            LastfmTagGetInfo,
            { tag: 'disco' },
            {
                tag: { name: 'disco', total: '12', reach: 34, wiki: { summary: 'Dance music.', content: 'Long.' } },
            },
            { name: 'disco', total: 12, reach: 34, summary: 'Dance music.' },
        ),
    ],
    [
        'tag.getTopAlbums',
        parseCase(
            'tag.getTopAlbums',
            LastfmTagGetTopAlbums,
            { tag: 'disco' },
            {
                albums: { album: { name: 'Believe', mbid: '', url: 'u', artist: CHER, '@attr': { rank: '2' } } },
            },
            { items: [{ name: 'Believe', mbid: null, url: 'u', artist: CHER, rank: 2 }] },
        ),
    ],
    [
        'tag.getTopTracks',
        parseCase(
            'tag.getTopTracks',
            LastfmTagGetTopTracks,
            { tag: 'disco' },
            {
                tracks: {
                    track: {
                        name: 'Believe',
                        duration: '239',
                        mbid: 'm',
                        url: 'u',
                        artist: CHER,
                        '@attr': { rank: '1' },
                    },
                },
            },
            { items: [{ name: 'Believe', mbid: 'm', url: 'u', artist: CHER, rank: 1, duration: 239 }] },
        ),
    ],
    [
        'chart.getTopArtists',
        parseCase(
            'chart.getTopArtists',
            LastfmChartGetTopArtists,
            {},
            {
                artists: { artist: { ...CHER, playcount: '100', listeners: '10', mbid: '' } },
            },
            { items: [{ name: 'Cher', mbid: null, url: 'https://last.fm/Cher', playcount: 100, listeners: 10 }] },
        ),
    ],
    [
        'chart.getTopTracks',
        parseCase(
            'chart.getTopTracks',
            LastfmChartGetTopTracks,
            {},
            {
                tracks: {
                    track: { name: 'Believe', playcount: '100', listeners: '10', mbid: 'm', url: 'u', artist: CHER },
                },
            },
            { items: [{ name: 'Believe', mbid: 'm', url: 'u', artist: CHER, playcount: 100, listeners: 10 }] },
        ),
    ],
    [
        'user.getTopAlbums',
        parseCase(
            'user.getTopAlbums',
            LastfmUserGetTopAlbums,
            { user: 'rj' },
            {
                topalbums: {
                    album: {
                        name: 'Believe',
                        playcount: '42',
                        mbid: '',
                        url: 'u',
                        artist: CHER,
                        '@attr': { rank: '1' },
                    },
                    '@attr': { user: 'rj' },
                },
            },
            { items: [{ name: 'Believe', mbid: null, url: 'u', artist: CHER, rank: 1, playcount: 42 }] },
        ),
    ],
])(
    '%s reads one-item lists, numeric strings and empty MBIDs',
    async (_, { method, json, call: callEndpoint, expected }) => {
        const fake = startFake();
        fake.respond(method, { json });

        expect(await callEndpoint(fake)).toEqual(expected);
    },
);

function startFake() {
    const fake = startFakeLastfm();
    fakes.push(fake);
    return fake;
}

function call<TParams>(endpoint: Endpoint<TParams, unknown>, params: TParams): EndpointCall {
    return fake => run(fake, endpoint, params);
}

function run<TParams, TResult>(fake: FakeLastfm, endpoint: Endpoint<TParams, TResult>, params: TParams) {
    const LastfmClient = defineLastfmClient({ apiKey: LASTFM_API_KEY, baseUrl: fake.baseUrl });
    const { container } = createTestContainer();
    container.set(RuntimeConfig, { LASTFM_API_KEY: 'test-key' });
    return container.resolve(LastfmClient)(endpoint, params);
}

/** A response fixture for one endpoint and the result it must parse into. */
interface ParseCase {
    method: string;
    json: unknown;
    call: EndpointCall;
    expected: unknown;
}

/** Types `expected` against the endpoint's own result, so a fixture cannot drift from the contract. */
function parseCase<TParams, TResult>(
    method: string,
    endpoint: Endpoint<TParams, TResult>,
    params: TParams,
    json: unknown,
    expected: TResult,
): ParseCase {
    return { method, json, call: call(endpoint, params), expected };
}
