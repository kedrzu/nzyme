import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { createTestLogger } from '@nzyme/logging/createTestLogger.js';

import { findChromeForTesting } from './findChromeForTesting.js';
import { getChromeForTestingRelease } from './getChromeForTestingRelease.js';
import { installChromeForTesting } from './installChromeForTesting.js';
import type { InstallChromeForTestingOptions, InstalledChromeForTesting } from './installChromeForTesting.js';

// The network is the boundary: a local server stands in for Chrome for Testing's storage, serving by version a small
// archive holding this platform's executable path. The unpacking runs for real, with the system's own tool.

const EXECUTABLE = getChromeForTestingRelease().executable;
const EXECUTABLE_CONTENT = '#!/bin/sh\n';

let tmp: string;
let server: ReturnType<typeof Bun.serve>;
let goodZip: Uint8Array;
const GARBAGE = new TextEncoder().encode('not a zip archive');
let goodRequests = 0;
let truncated = false;

beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'stealth-browser-cft-'));
    goodZip = createZip(EXECUTABLE, new TextEncoder().encode(EXECUTABLE_CONTENT));
    server = Bun.serve({
        port: 0,
        fetch(request) {
            const [, version] = new URL(request.url).pathname.split('/');
            switch (version) {
                case 'good':
                case 'unverified':
                    goodRequests++;
                    return new Response(goodZip);
                case 'garbage':
                    return new Response(GARBAGE);
                case 'partial':
                    return new Response(cutShort(goodZip));
                default:
                    return new Response('nope', { status: 404 });
            }
        },
    });
});

afterAll(async () => {
    await server.stop(true);
});

test('never unpacks an archive whose SHA-256 is not the expected one', async () => {
    const cacheDir = createCacheDir();

    await expect(install({ cacheDir, version: 'good', sha256: sha256Of(new Uint8Array([1, 2, 3])) })).rejects.toThrow(
        'pinned checksum',
    );

    expect(findChromeForTesting({ cacheDir, version: 'good' })).toBeNull();
    expect(await readdir(cacheDir)).toEqual([]);
});

test('leaves no install and no leftovers after a download cut short', async () => {
    const cacheDir = createCacheDir();

    await expect(install({ cacheDir, version: 'partial', sha256: sha256Of(goodZip) })).rejects.toThrow();

    expect(truncated).toBe(true);
    expect(findChromeForTesting({ cacheDir, version: 'partial' })).toBeNull();
    expect(await readdir(cacheDir)).toEqual([]);
});

test('leaves no install and no leftovers when the verified archive fails to unpack', async () => {
    const cacheDir = createCacheDir();

    await expect(install({ cacheDir, version: 'garbage', sha256: sha256Of(GARBAGE) })).rejects.toThrow(
        'failed to unpack',
    );

    expect(findChromeForTesting({ cacheDir, version: 'garbage' })).toBeNull();
    expect(await readdir(cacheDir)).toEqual([]);
});

test('rejects a failed request', async () => {
    const cacheDir = createCacheDir();

    await expect(install({ cacheDir, version: 'missing', sha256: sha256Of(goodZip) })).rejects.toThrow('HTTP 404');

    expect(findChromeForTesting({ cacheDir, version: 'missing' })).toBeNull();
});

test('unpacks a verified archive once for concurrent calls, removes leftovers and reuses the install', async () => {
    const cacheDir = createCacheDir();
    const { platform } = getChromeForTestingRelease();
    await mkdir(path.join(cacheDir, '.install-stale'), { recursive: true });
    const requestsBefore = goodRequests;
    expect(findChromeForTesting({ cacheDir, version: 'good' })).toBeNull();

    const results = await Promise.all([
        install({ cacheDir, version: 'good', sha256: sha256Of(goodZip) }),
        install({ cacheDir, version: 'good', sha256: sha256Of(goodZip) }),
    ]);
    await install({ cacheDir, version: 'good', sha256: sha256Of(goodZip) });

    const expected: InstalledChromeForTesting = {
        executablePath: path.join(cacheDir, `good-${platform}`, EXECUTABLE),
        version: 'good',
    };
    expect(results).toEqual([expected, expected]);
    expect(goodRequests - requestsBefore).toBe(1);
    expect(await Bun.file(expected.executablePath).text()).toBe(EXECUTABLE_CONTENT);
    expect(findChromeForTesting({ cacheDir, version: 'good' })).toBe(expected.executablePath);
    expect(await readdir(cacheDir)).toEqual([`good-${platform}`]);
});

test('installs a version with no checksum unverified and says so', async () => {
    const cacheDir = createCacheDir();
    const { logger, logs } = createTestLogger('ChromeForTesting');

    const installed = await installChromeForTesting({
        cacheDir,
        version: 'unverified',
        baseUrl: `http://localhost:${server.port}`,
        logger,
    });

    expect(await Bun.file(installed.executablePath).text()).toBe(EXECUTABLE_CONTENT);
    expect(logs.some(log => log.level === 'warn' && log.message.includes('downloading unverified'))).toBe(true);
});

function install(options: Pick<InstallChromeForTestingOptions, 'cacheDir' | 'version' | 'sha256'>) {
    return installChromeForTesting({
        ...options,
        baseUrl: `http://localhost:${server.port}`,
        logger: createTestLogger('ChromeForTesting').logger,
    });
}

function createCacheDir() {
    return path.join(tmp, crypto.randomUUID());
}

function sha256Of(bytes: Uint8Array) {
    return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

/** A body that sends the archive's first bytes, then ends early. */
function cutShort(bytes: Uint8Array) {
    let sent = false;
    return new ReadableStream({
        async pull(controller) {
            if (!sent) {
                sent = true;
                controller.enqueue(bytes.slice(0, 10));
                return;
            }
            truncated = true;
            await Bun.sleep(20);
            controller.close();
        },
    });
}

/** A zip archive holding one executable file, stored uncompressed: what every platform's unpacking tool reads. */
function createZip(name: string, content: Uint8Array) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = Bun.hash.crc32(content);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04_03_4b_50, true);
    local.setUint16(4, 20, true);
    local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, content.length, true);
    local.setUint32(22, content.length, true);
    local.setUint16(26, nameBytes.length, true);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02_01_4b_50, true);
    // Made by Unix (3), so the external attributes carry the file's mode: a regular executable file.
    central.setUint16(4, (3 << 8) | 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(14, 0x21, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, content.length, true);
    central.setUint32(24, content.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(38, (0o100_755 << 16) >>> 0, true);

    const localSize = 30 + nameBytes.length + content.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06_05_4b_50, true);
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    end.setUint32(12, 46 + nameBytes.length, true);
    end.setUint32(16, localSize, true);

    return new Uint8Array(
        Buffer.concat([
            new Uint8Array(local.buffer),
            nameBytes,
            content,
            new Uint8Array(central.buffer),
            nameBytes,
            new Uint8Array(end.buffer),
        ]),
    );
}
