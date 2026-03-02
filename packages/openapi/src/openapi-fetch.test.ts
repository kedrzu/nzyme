import { beforeEach, describe, expect, it, vi } from 'bun:test';

import { createOpenApiFetch } from './openapi-fetch.js';
import type { paths } from '../tests/schema.js';

// Mock fetch function
const mockFetch = vi.fn();

describe('openApiFetch', () => {
    beforeEach(() => {
        mockFetch.mockClear();
    });

    it('should make a GET request with path parameters', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ id: 123, name: 'Test Pet', status: 'available' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            fetch: mockFetch,
            baseUrl: 'https://api.example.com',
        });

        const result = await client({
            path: '/pet/{petId}',
            method: 'GET',
            pathParams: { petId: 123 },
        });

        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.example.com/pet/123',
            expect.objectContaining({
                method: 'GET',
                headers: expect.any(Headers) as Headers,
            }),
        );

        expect(result.data).toEqual({ id: 123, name: 'Test Pet', status: 'available' });
        expect(result.status).toBe(200);
        expect(result.contentType).toBe('application/json');
    });

    it('should make a GET request with query parameters', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve([{ id: 1, name: 'Pet 1', status: 'available' }]),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            fetch: mockFetch,
        });

        const result = await client({
            path: '/pet/findByStatus',
            method: 'GET',
            baseUrl: 'https://api.example.com',
            query: { status: 'available' },
        });

        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.example.com/pet/findByStatus?status=available',
            expect.objectContaining({
                method: 'GET',
                headers: expect.any(Headers) as Headers,
            }),
        );

        expect(result.data).toEqual([{ id: 1, name: 'Pet 1', status: 'available' }]);
        expect(result.status).toBe(200);
        expect(result.contentType).toBe('application/json');
    });

    it('should make a POST request with JSON body', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ id: 456, name: 'New Pet', status: 'available' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const petData = {
            name: 'New Pet',
            photoUrls: ['http://example.com/photo.jpg'],
            status: 'available' as const,
        };

        const client = createOpenApiFetch<paths>({
            baseUrl: 'https://api.example.com',
            fetch: mockFetch,
        });

        const result = await client({
            path: '/pet',
            method: 'POST',
            contentType: 'application/json',
            body: {
                ...petData,
            },
        });

        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.example.com/pet',
            expect.objectContaining({
                method: 'POST',
                headers: expect.any(Headers) as Headers,
                body: JSON.stringify(petData),
            }),
        );

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const headers = options.headers as Headers;
        expect(headers.get('content-type')).toBe('application/json');

        expect(result.data).toEqual({ id: 456, name: 'New Pet', status: 'available' });
        expect(result.status).toBe(200);
        expect(result.contentType).toBe('application/json');
    });

    it('should handle error responses', async () => {
        const mockResponse = {
            ok: false,
            status: 404,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ message: 'Pet not found' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            fetch: mockFetch,
        });

        const result = await client({
            method: 'GET',
            path: '/pet/{petId}',
            baseUrl: 'https://api.example.com',
            pathParams: { petId: 999 },
        });

        expect(result.data).toEqual({ message: 'Pet not found' });
        expect(result.status).toBe(404);
        expect(result.contentType).toBe('application/json');
    });

    it('should handle custom headers', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({}),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            fetch: mockFetch,
        });

        await client({
            method: 'DELETE',
            path: '/pet/{petId}',
            baseUrl: 'https://api.example.com',
            pathParams: { petId: 123 },
            headers: {
                api_key: 'secret-key',
                'X-Custom-Header': 'custom-value',
            },
        });

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const headers = options.headers as Headers;
        expect(headers.get('api_key')).toBe('secret-key');
        expect(headers.get('X-Custom-Header')).toBe('custom-value');
    });

    it('should handle text responses', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'text/plain' }),
            text: () => Promise.resolve('Success'),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            fetch: mockFetch,
        });

        const result = await client({
            method: 'GET',
            path: '/user/logout',
            baseUrl: 'https://api.example.com',
        });

        expect(result.data).toBe('Success');
        expect(result.status).toBe(200);
        expect(result.contentType).toBe('text/plain');
    });

    it('should handle FormData body', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ message: 'File uploaded' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const body = 'test';

        const client = createOpenApiFetch<paths>({
            fetch: mockFetch,
            baseUrl: 'https://api.example.com',
        });

        const result = await client({
            method: 'POST',
            path: '/pet/{petId}/uploadImage',
            pathParams: { petId: 123 },
            contentType: 'application/octet-stream',
            body,
        });

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(options.body).toBe(body);
        expect(result.data).toEqual({ message: 'File uploaded' });
        expect(result.contentType).toBe('application/json');
    });

    it('should handle different content types', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ id: 456, name: 'New Pet', status: 'available' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            fetch: mockFetch,
        });

        const petData = {
            name: 'XML Pet',
            photoUrls: ['http://example.com/photo.jpg'],
            status: 'available' as const,
        };

        await client({
            method: 'POST',
            path: '/pet',
            baseUrl: 'https://api.example.com',
            contentType: 'application/xml',
            body: petData,
        });

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const headers = options.headers as Headers;
        expect(headers.get('content-type')).toBe('application/xml');
    });

    it('should handle text/event-stream responses without consuming the stream', async () => {
        const mockBody = {
            getReader: vi.fn(),
        };
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'text/event-stream' }),
            body: mockBody,
            json: vi.fn(),
            text: vi.fn(),
            blob: vi.fn(),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            fetch: mockFetch,
        });

        const result = await client({
            method: 'GET',
            path: '/pet/{petId}',
            baseUrl: 'https://api.example.com',
            pathParams: { petId: 123 },
        });

        expect(result.status).toBe(200);
        expect(result.contentType).toBe('text/event-stream');
        expect(result.data).toBeUndefined();
        expect(result.response.body).toBe(mockBody);
        // Verify we didn't consume the stream
        expect(mockResponse.json).not.toHaveBeenCalled();
        expect(mockResponse.text).not.toHaveBeenCalled();
        expect(mockResponse.blob).not.toHaveBeenCalled();
    });

    it('should strip charset from content-type header', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
            json: () => Promise.resolve({ id: 123, name: 'Test Pet' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            fetch: mockFetch,
        });

        const result = await client({
            method: 'GET',
            path: '/pet/{petId}',
            baseUrl: 'https://api.example.com',
            pathParams: { petId: 123 },
        });

        expect(result.contentType).toBe('application/json');
        expect(result.data).toEqual({ id: 123, name: 'Test Pet' });
    });
});

describe('createOpenApiFetch', () => {
    beforeEach(() => {
        mockFetch.mockClear();
    });

    it('should use default configuration', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ id: 1 }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            baseUrl: 'https://api.example.com',
            headers: { Authorization: 'Bearer token' },
            fetch: mockFetch,
        });

        await client({
            method: 'GET',
            path: '/pet/{petId}',
            pathParams: { petId: 1 },
        });

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.example.com/pet/1');

        const headers = options.headers as Headers;
        expect(headers.get('Authorization')).toBe('Bearer token');
    });

    it('should override base URL per request', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ id: 1 }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            baseUrl: 'https://api.example.com',
            fetch: mockFetch,
        });

        await client({
            method: 'GET',
            path: '/pet/{petId}',
            baseUrl: 'https://api-v2.example.com',
            pathParams: { petId: 1 },
        });

        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api-v2.example.com/pet/1');
    });

    it('should use custom fetch implementation', async () => {
        const customFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ id: 1 }),
        });

        const client = createOpenApiFetch<paths>({
            fetch: customFetch,
        });

        await client({
            method: 'GET',
            path: '/pet/{petId}',
            pathParams: { petId: 1 },
        });

        expect(customFetch).toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should pass through fetch options', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ id: 1 }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<paths>({
            baseUrl: 'https://api.example.com',
            fetch: mockFetch,
        });

        await client({
            method: 'GET',
            path: '/pet/{petId}',
            pathParams: { petId: 1 },
            fetchOptions: {
                signal: new AbortController().signal,
                cache: 'no-cache',
            },
        });

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(options.cache).toBe('no-cache');
    });
});
