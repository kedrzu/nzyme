import { afterEach, expect, test } from 'bun:test';

import { RuntimeConfig } from '@nzyme/config/RuntimeConfig.js';
import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

import { getClosedLastfmUrl, startFakeLastfm } from './__fixtures__/fakeLastfm.js';
import type { FakeLastfm, FakeLastfmResponse } from './__fixtures__/fakeLastfm.js';
import { defineLastfmClient } from './defineLastfmClient.js';
import { LastfmError } from './LastfmError.js';
import type { LastfmErrorOptions } from './LastfmError.js';
import { readLastfmBody } from './readLastfmBody.js';

const API_KEY = 'sentinel-lastfm-key-4f2a';
const LASTFM_API_KEY = defineSecret('LASTFM_API_KEY');

/** A stand-in for the real endpoints, which decode their bodies the same way. */
const ArtistGetInfo = defineEndpoint<{ artist: string }, unknown>({
    request: params => ({ url: '', query: { method: 'artist.getInfo', artist: params.artist } }),
    response: response => readLastfmBody(response, 'artist.getInfo'),
});

const fakes: FakeLastfm[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(fake => fake.stop()));
});

test('sends the endpoint query with api_key, format=json and the User-Agent, and returns the body', async () => {
    const fake = startFake({ 'artist.getinfo': { json: { artist: { name: 'Radiohead' } } } });
    const { lastfm } = createClient(fake.baseUrl);

    const result = await lastfm(ArtistGetInfo, { artist: 'Radiohead' });

    expect(result).toEqual({ artist: { name: 'Radiohead' } });
    expect(fake.requests).toHaveLength(1);
    const [request] = fake.requests;
    expect(Object.fromEntries(request!.query)).toEqual({
        method: 'artist.getInfo',
        artist: 'Radiohead',
        api_key: API_KEY,
        format: 'json',
    });
    expect(request!.headers.get('user-agent')).toBe('@nzyme/lastfm-cli (+https://github.com/kedrzu/nzyme)');
});

test('error 6 (not found) is null', async () => {
    const fake = startFake({
        'artist.getInfo': { json: { error: 6, message: 'The artist could not be found', links: [] } },
    });
    const { lastfm } = createClient(fake.baseUrl);

    expect(await lastfm(ArtistGetInfo, { artist: 'Nobody' })).toBeNull();
});

test.each<[string, FakeLastfmResponse, LastfmErrorOptions, string]>([
    [
        'a rate limit with a 200',
        { json: { error: 29, message: `Rate limit exceeded for ${API_KEY}`, links: [] } },
        { method: 'artist.getInfo', code: 29, status: 200 },
        'Last.fm rate limit exceeded (artist.getInfo)',
    ],
    [
        'an invalid key with a 403',
        { status: 403, json: { error: 10, message: `Invalid API key ${API_KEY}`, links: [] } },
        { method: 'artist.getInfo', code: 10, status: 403 },
        'Last.fm rejected the API key as invalid (artist.getInfo, error 10)',
    ],
    [
        'another Last.fm error',
        { status: 400, json: { error: 8, message: `Operation failed ${API_KEY}`, links: [] } },
        { method: 'artist.getInfo', code: 8, status: 400 },
        'Last.fm error 8 (artist.getInfo, HTTP 400)',
    ],
    [
        'a non-JSON 5xx',
        { status: 502, text: `<html>Bad gateway for /2.0/?api_key=${API_KEY}</html>` },
        { method: 'artist.getInfo', code: null, status: 502 },
        'Last.fm request failed with HTTP 502 (artist.getInfo)',
    ],
])('%s throws a LastfmError that never holds the API key', async (_, response, expected, message) => {
    const fake = startFake({ 'artist.getInfo': response });
    const { lastfm, logs } = createClient(fake.baseUrl);

    const error = await lastfm(ArtistGetInfo, { artist: 'Radiohead' }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(LastfmError);
    expect(error).toMatchObject({ ...expected, message });
    expectNoApiKey(error, logs);
});

test('a refused connection throws a LastfmError with no cause and no API key', async () => {
    const { lastfm, logs } = createClient(await getClosedLastfmUrl());

    const error = await lastfm(ArtistGetInfo, { artist: 'Radiohead' }).catch((thrown: unknown) => thrown);

    const expected: LastfmErrorOptions = { method: 'artist.getInfo', code: null, status: 0 };
    expect(error).toBeInstanceOf(LastfmError);
    expect(error).toMatchObject({ ...expected, message: 'Last.fm request failed: no response (artist.getInfo)' });
    expect(error).not.toHaveProperty('cause');
    expectNoApiKey(error, logs);
});

test('requests through one client start at least 200 ms apart', async () => {
    const fake = startFake({ 'artist.getInfo': { json: { artist: {} } } });
    const { lastfm } = createClient(fake.baseUrl);

    await Promise.all(['A', 'B', 'C', 'D'].map(artist => lastfm(ArtistGetInfo, { artist })));

    expect(fake.requests).toHaveLength(4);
    const gaps = fake.requests.slice(1).map((request, index) => request.receivedAt - fake.requests[index]!.receivedAt);
    // A few ms below 200 is timer and socket jitter, not a request let through early.
    expect(gaps.every(gap => gap >= 190)).toBe(true);
});

function startFake(responses: Record<string, FakeLastfmResponse>) {
    const fake = startFakeLastfm({ responses });
    fakes.push(fake);
    return fake;
}

function createClient(baseUrl: string) {
    const LastfmClient = defineLastfmClient({ apiKey: LASTFM_API_KEY, baseUrl });
    const { container, logs } = createTestContainer();
    container.set(RuntimeConfig, { LASTFM_API_KEY: API_KEY });
    return { lastfm: container.resolve(LastfmClient), logs };
}

function expectNoApiKey(error: unknown, logs: unknown[]) {
    // The CLI logs the whole error object: its inspection shows the message, stack and every property.
    expect(Bun.inspect(error)).not.toContain(API_KEY);
    expect(Bun.inspect(logs)).not.toContain(API_KEY);
}
