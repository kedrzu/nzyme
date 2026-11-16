import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { resetProcessLoggerLevels } from '@nzyme/logging/shouldLog.js';

import { loadEnvVariables } from './loadEnvVariables.js';

const originalLogLevel = process.env.LOG_LEVEL;
let dir: string;
let stderr: ReturnType<typeof spyOn<Console, 'error'>>;

beforeEach(() => {
    resetProcessLoggerLevels();
    dir = mkdtempSync(path.join(tmpdir(), 'load-env-'));
    writeFileSync(path.join(dir, '.env'), 'SOME_KEY=value\n');
    writeFileSync(path.join(dir, 'package.json'), '{}');
    stderr = spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    stderr.mockRestore();
    rmSync(dir, { recursive: true });
    resetProcessLoggerLevels();
    if (originalLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
    } else {
        process.env.LOG_LEVEL = originalLogLevel;
    }
});

test('loads silently by default', () => {
    delete process.env.LOG_LEVEL;
    const output: Record<string, string> = {};

    loadEnvVariables({ cwd: dir, root: false, output });

    expect(output.SOME_KEY).toBe('value');
    expect(stderr).not.toHaveBeenCalled();
});

test('reports the loaded file on stderr with LOG_LEVEL=debug', () => {
    process.env.LOG_LEVEL = 'debug';

    loadEnvVariables({ cwd: dir, root: false, output: {} });

    expect(stderr).toHaveBeenCalledTimes(1);
});

test('stays silent with LOG_LEVEL=info', () => {
    process.env.LOG_LEVEL = 'info';

    loadEnvVariables({ cwd: dir, root: false, output: {} });

    expect(stderr).not.toHaveBeenCalled();
});
