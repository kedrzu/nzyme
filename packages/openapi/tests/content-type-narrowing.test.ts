import { describe, expect, it, vi } from 'vitest';

import { createOpenApiFetch } from '../src/openapi-fetch.js';

/**
 * Example schema with multiple content types for the same status
 */
interface TestPaths {
    '/messages': {
        post: {
            responses: {
                200: {
                    content: {
                        'application/json': {
                            id: string;
                            text: string;
                        };
                        'text/event-stream': string;
                    };
                };
                401: {
                    content: {
                        'text/plain': string;
                    };
                };
            };
        };
    };
}

const mockFetch = vi.fn();

describe('Content-Type Narrowing', () => {
    it('should narrow types based on status and contentType', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ id: '123', text: 'Hello' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<TestPaths>({
            fetch: mockFetch,
        });

        const result = await client({
            method: 'POST',
            path: '/messages',
        });

        // Type narrowing by status and contentType
        if (result.status === 200 && result.contentType === 'application/json') {
            // result.data is typed as { id: string; text: string }
            expect(result.data.id).toBe('123');
            expect(result.data.text).toBe('Hello');
        } else if (result.status === 200 && result.contentType === 'text/event-stream') {
            // result.data is undefined for streams
            expect(result.data).toBeUndefined();
        } else if (result.status === 401) {
            // result.data is typed as string
            expect(typeof result.data).toBe('string');
        }
    });

    it('should handle event-stream responses correctly', async () => {
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

        const client = createOpenApiFetch<TestPaths>({
            fetch: mockFetch,
        });

        const result = await client({
            method: 'POST',
            path: '/messages',
        });

        expect(result.status).toBe(200);
        expect(result.contentType).toBe('text/event-stream');

        // For event streams, data is undefined and caller should use response.body
        if (result.status === 200 && result.contentType === 'text/event-stream') {
            expect(result.data).toBeUndefined();
            expect(result.response.body).toBe(mockBody);
        }

        // Verify we didn't consume the stream
        expect(mockResponse.json).not.toHaveBeenCalled();
        expect(mockResponse.text).not.toHaveBeenCalled();
        expect(mockResponse.blob).not.toHaveBeenCalled();
    });

    it('should narrow to specific error types', async () => {
        const mockResponse = {
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'text/plain' }),
            text: () => Promise.resolve('Unauthorized'),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const client = createOpenApiFetch<TestPaths>({
            fetch: mockFetch,
        });

        const result = await client({
            method: 'POST',
            path: '/messages',
        });

        expect(result.status).toBe(401);
        expect(result.contentType).toBe('text/plain');

        if (result.status === 401) {
            // result.data is typed as string
            expect(result.data).toBe('Unauthorized');
        }
    });
});


