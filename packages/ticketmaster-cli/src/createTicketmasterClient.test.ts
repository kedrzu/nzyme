import { afterEach, describe, expect, test } from 'bun:test';

import { createTicketmasterClient } from './createTicketmasterClient.js';
import type { FakeTicketmaster } from './__fixtures__/fakeTicketmaster.js';
import { startFakeTicketmaster } from './__fixtures__/fakeTicketmaster.js';
import { TicketmasterAttractionSearch } from './TicketmasterAttractionSearch.js';
import { TicketmasterError } from './TicketmasterError.js';
import { TicketmasterEventGet } from './TicketmasterEventGet.js';
import { TicketmasterEventSearch } from './TicketmasterEventSearch.js';

const KEY = 'sekret-api-key-123';

/** Collects every string reachable from an error: message, stack, name, data, cause. */
function collectStrings(value: unknown, seen = new Set<unknown>(), out: string[] = []): string[] {
    if (typeof value === 'string') {
        out.push(value);
    } else if (typeof value === 'object' && value !== null && !seen.has(value)) {
        seen.add(value);
        if (value instanceof Error) {
            out.push(value.message, value.stack ?? '', value.name);
        }
        for (const key of Reflect.ownKeys(value)) {
            out.push(String(key));
            collectStrings(Reflect.get(value, key), seen, out);
        }
    }
    return out;
}

let fake: FakeTicketmaster | undefined;

afterEach(async () => {
    await fake?.stop();
    fake = undefined;
});

describe('createTicketmasterClient', () => {
    test('searches events with a key string and returns typed items and page', async () => {
        fake = startFakeTicketmaster({
            '/discovery/v2/events.json': () =>
                Response.json({
                    _embedded: { events: [{ id: 'e1', name: 'Concert' }] },
                    page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
                }),
        });
        const client = createTicketmasterClient({ apiKey: KEY, baseUrl: fake.baseUrl });

        const result = await client(TicketmasterEventSearch, { keyword: 'rock', city: undefined, size: 20 });

        expect(result.items.map(event => event.name)).toEqual(['Concert']);
        expect(result.page).toEqual({ size: 20, totalElements: 1, totalPages: 1, number: 0 });
        const [request] = fake.requests;
        expect(request?.query.get('apikey')).toBe(KEY);
        expect(request?.query.get('locale')).toBe('*');
        expect(request?.query.get('keyword')).toBe('rock');
        expect(request?.query.has('city')).toBe(false);
    });

    test('an apiKey function is read per request and locale is overridable', async () => {
        fake = startFakeTicketmaster({ '/discovery/v2/attractions.json': () => Response.json({}) });
        const client = createTicketmasterClient({
            apiKey: () => Promise.resolve(KEY),
            baseUrl: fake.baseUrl,
            locale: 'pl-pl',
        });

        await client(TicketmasterAttractionSearch, { keyword: 'x', size: 5, page: 0 });

        expect(fake.requests[0]?.query.get('apikey')).toBe(KEY);
        expect(fake.requests[0]?.query.get('locale')).toBe('pl-pl');
    });

    test('an empty result without _embedded is an empty list', async () => {
        fake = startFakeTicketmaster({
            '/discovery/v2/events.json': () =>
                Response.json({ page: { size: 20, totalElements: 0, totalPages: 0, number: 0 } }),
        });
        const client = createTicketmasterClient({ apiKey: KEY, baseUrl: fake.baseUrl });

        const result = await client(TicketmasterEventSearch, {});

        expect(result.items).toEqual([]);
        expect(result.page.totalElements).toBe(0);
    });

    test('event get returns null for 404 and 400', async () => {
        fake = startFakeTicketmaster({
            '/discovery/v2/events/gone.json': () => new Response('x', { status: 404 }),
            '/discovery/v2/events/bad.json': () => new Response('x', { status: 400 }),
        });
        const client = createTicketmasterClient({ apiKey: KEY, baseUrl: fake.baseUrl });

        expect(await client(TicketmasterEventGet, { id: 'gone' })).toBeNull();
        expect(await client(TicketmasterEventGet, { id: 'bad' })).toBeNull();
    });

    test('a 429 names both limits and the reset time', async () => {
        fake = startFakeTicketmaster({
            '/discovery/v2/events.json': () =>
                new Response('x', { status: 429, headers: { 'Rate-Limit-Reset': '1457417554290' } }),
        });
        const client = createTicketmasterClient({ apiKey: KEY, baseUrl: fake.baseUrl });

        const error = await client(TicketmasterEventSearch, {}).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(TicketmasterError);
        expect((error as TicketmasterError).message).toContain('5 requests/s');
        expect((error as TicketmasterError).message).toContain('5000 calls/day');
        expect((error as TicketmasterError).message).toContain('2016-03-08T06:12:34.290Z');
    });

    describe('the API key never appears in a thrown error', () => {
        test.each([
            ['401', 401],
            ['429', 429],
            ['500', 500],
        ])('status %s', async (_name, status) => {
            fake = startFakeTicketmaster({
                '/discovery/v2/events.json': () => new Response(`bad apikey=${KEY}`, { status }),
            });
            const client = createTicketmasterClient({ apiKey: KEY, baseUrl: fake.baseUrl });

            const error = await client(TicketmasterEventSearch, {}).catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(TicketmasterError);
            expect((error as TicketmasterError).data).toEqual({ operation: '/discovery/v2/events.json', status });
            expect(collectStrings(error).join('\n')).not.toContain(KEY);
        });

        test('network failure', async () => {
            const closed = startFakeTicketmaster({});
            const { baseUrl } = closed;
            await closed.stop();
            const client = createTicketmasterClient({ apiKey: KEY, baseUrl });

            const error = await client(TicketmasterEventSearch, {}).catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(TicketmasterError);
            expect((error as TicketmasterError).message).toStartWith('Could not reach Ticketmaster (');
            expect((error as TicketmasterError).cause).toBeUndefined();
            expect(collectStrings(error).join('\n')).not.toContain(KEY);
        });
    });
});
