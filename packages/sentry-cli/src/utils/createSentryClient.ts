import fetch from 'node-fetch';

import type { SentryConfig } from '../cli/defineSentryCommands.js';

/**
 * Sentry API client for making HTTP requests.
 */
export class SentryApiClient {
    private readonly baseUrl: string;
    private readonly token: string;

    /**
     * Create a new Sentry API client.
     */
    constructor(config: SentryConfig) {
        this.baseUrl = config.apiUrl || 'https://sentry.io/api/0';
        this.token = config.apiToken;
    }

    /**
     * Make a GET request to the Sentry API.
     * @__NO_SIDE_EFFECTS__
     */
    async get<T = unknown>(endpoint: string): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Sentry API error: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<T>;
    }

    /**
     * Make a PUT request to the Sentry API.
     * @__NO_SIDE_EFFECTS__
     */
    async put<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: data ? JSON.stringify(data) : undefined,
        });

        if (!response.ok) {
            throw new Error(`Sentry API error: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<T>;
    }
}

/**
 * Create a Sentry API client.
 * @__NO_SIDE_EFFECTS__
 */
export function createSentryClient(config: SentryConfig): SentryApiClient {
    return new SentryApiClient(config);
}
