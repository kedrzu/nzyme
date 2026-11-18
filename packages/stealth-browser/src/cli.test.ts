import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';
import { chromium } from 'playwright';

import { assert } from '@nzyme/utils/assert.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/** The CLI starts a real Chromium, Playwright's, headless and without the sandbox, which CI runners do not allow. */
const TIMEOUT_MS = 30_000;

test(
    'prints the endpoint of a browser a raw CDP client drives undetected, and exits when killed',
    async () => {
        const cli = Bun.spawn(
            [
                process.execPath,
                path.join(import.meta.dir, 'cli.ts'),
                '--chrome',
                chromium.executablePath(),
                '--user-data-dir',
                await mkdtemp(path.join(os.tmpdir(), 'stealth-browser-cli-')),
                '--',
                '--headless=new',
                '--no-sandbox',
            ],
            { stdout: 'pipe', stderr: 'ignore' },
        );
        try {
            const endpoint = await readFirstLine(cli.stdout);
            expect(endpoint).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/[\da-f-]{36}$/);

            const cdp = await connectCdp(endpoint);
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
            assert(typeof sessionId === 'string', 'Attaching gives a session');
            const { result } = await cdp.send(
                'Runtime.evaluate',
                { expression: 'navigator.webdriver', returnByValue: true },
                sessionId,
            );
            cdp.close();

            expect(result).toEqual({ type: 'boolean', value: false });
        } finally {
            cli.kill('SIGTERM');
        }

        expect(await cli.exited).toBe(0);
    },
    TIMEOUT_MS,
);

async function readFirstLine(stream: ReadableStream<Uint8Array>) {
    const decoder = new TextDecoder();
    let text = '';
    for await (const chunk of stream) {
        text += decoder.decode(chunk, { stream: true });
        const end = text.indexOf('\n');
        if (end !== -1) {
            return text.slice(0, end);
        }
    }
    throw new Error(`The CLI ended its output without a line: ${text}`);
}

/** A raw CDP client over Bun's WebSocket: `send` resolves with the command's result, rejects on its error. */
async function connectCdp(endpoint: string) {
    const socket = new WebSocket(endpoint);
    const pending = new Map<number, { resolve(result: Record<string, unknown>): void; reject(error: Error): void }>();
    let lastId = 0;
    socket.addEventListener('message', event => {
        const message: unknown = JSON.parse(String(event.data));
        if (!isPlainObject(message) || typeof message['id'] !== 'number') {
            return;
        }
        const waiting = pending.get(message['id']);
        pending.delete(message['id']);
        const { result, error } = message;
        if (isPlainObject(result)) {
            waiting?.resolve(result);
        } else {
            waiting?.reject(new Error(JSON.stringify(error)));
        }
    });
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve);
        socket.addEventListener('error', reject);
    });

    return {
        send(method: string, params: object, sessionId?: string) {
            const id = ++lastId;
            socket.send(JSON.stringify({ id, method, params, sessionId }));
            return new Promise<Record<string, unknown>>((resolve, reject) => {
                pending.set(id, { resolve, reject });
            });
        },
        close: () => socket.close(),
    };
}
