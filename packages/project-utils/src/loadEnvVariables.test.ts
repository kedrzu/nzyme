import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { loadEnvVariables } from './loadEnvVariables.js';

const originalLogging = process.env.LOGGING;
let dir: string;
let stderr: ReturnType<typeof spyOn<Console, 'error'>>;

beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'load-env-'));
    writeFileSync(path.join(dir, '.env'), 'SOME_KEY=value\n');
    writeFileSync(path.join(dir, 'package.json'), '{}');
    stderr = spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    stderr.mockRestore();
    rmSync(dir, { recursive: true });
    if (originalLogging === undefined) {
        delete process.env.LOGGING;
    } else {
        process.env.LOGGING = originalLogging;
    }
});

test('loads silently by default', () => {
    delete process.env.LOGGING;
    const output: Record<string, string> = {};

    loadEnvVariables({ cwd: dir, root: false, output });

    expect(output.SOME_KEY).toBe('value');
    expect(stderr).not.toHaveBeenCalled();
});

test('reports the loaded file on stderr with LOGGING=true', () => {
    process.env.LOGGING = 'true';

    loadEnvVariables({ cwd: dir, root: false, output: {} });

    expect(stderr).toHaveBeenCalledTimes(1);
});
