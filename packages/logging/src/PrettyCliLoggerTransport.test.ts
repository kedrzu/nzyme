import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import type { LoggerTransport } from './LoggerTransport.js';
import { PrettyCliLoggerTransport } from './PrettyCliLoggerTransport.js';

let stderr: ReturnType<typeof spyOn<Console, 'error'>>;

beforeEach(() => {
    stderr = spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    stderr.mockRestore();
});

function createTransport(env: Record<string, string>): LoggerTransport {
    const container = createContainer();
    container.set(EnvVariables, env);
    return container.resolve(PrettyCliLoggerTransport);
}

test('hides debug and trace by default', () => {
    const transport = createTransport({});

    transport('test', 'debug', 'debug line');
    transport('test', 'trace', 'trace line');

    expect(stderr).not.toHaveBeenCalled();
});

test('shows debug and trace with LOGGING=true', () => {
    const transport = createTransport({ LOGGING: 'true' });

    transport('test', 'debug', 'debug line');
    transport('test', 'trace', 'trace line');

    expect(stderr).toHaveBeenCalledTimes(2);
});

test('always shows info, warn and error', () => {
    const transport = createTransport({});

    transport('test', 'info', 'info line');
    transport('test', 'warn', 'warn line');
    transport('test', 'error', 'error line');

    expect(stderr).toHaveBeenCalledTimes(3);
});
