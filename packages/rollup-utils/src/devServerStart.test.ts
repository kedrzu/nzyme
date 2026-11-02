import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { devServerStart } from './devServerStart.js';

let dir: string;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-dev-server-start-'));
    await fs.writeFile(path.join(dir, 'entry.js'), 'export {};\n');
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

test('listens only on the given host', async () => {
    const { httpServer } = devServerStart({
        input: path.join(dir, 'entry.js'),
        output: { dir: path.join(dir, 'dist'), format: 'es' },
        port: 0,
        host: '127.0.0.1',
    });

    try {
        await once(httpServer, 'listening');
        expect((httpServer.address() as AddressInfo).address).toBe('127.0.0.1');
    } finally {
        httpServer.close();
    }
});
