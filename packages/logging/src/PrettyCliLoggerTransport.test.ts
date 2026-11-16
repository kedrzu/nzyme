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

test('unset LOG_LEVEL shows info and above only', () => {
    const transport = createTransport({});

    transport('test', 'trace', 'trace line');
    transport('test', 'debug', 'debug line');
    expect(stderr).not.toHaveBeenCalled();

    transport('test', 'info', 'info line');
    transport('test', 'warn', 'warn line');
    transport('test', 'error', 'error line');
    expect(stderr).toHaveBeenCalledTimes(3);
});

test('empty LOG_LEVEL means unset', () => {
    const transport = createTransport({ LOG_LEVEL: '' });

    transport('test', 'debug', 'debug line');

    expect(stderr).not.toHaveBeenCalled();
});

test('LOG_LEVEL=trace shows every level', () => {
    const transport = createTransport({ LOG_LEVEL: 'trace' });

    transport('test', 'trace', 'trace line');
    transport('test', 'debug', 'debug line');

    expect(stderr).toHaveBeenCalledTimes(2);
});

test('LOG_LEVEL=warn hides info and shows warn and error', () => {
    const transport = createTransport({ LOG_LEVEL: 'warn' });

    transport('test', 'info', 'info line');
    expect(stderr).not.toHaveBeenCalled();

    transport('test', 'warn', 'warn line');
    transport('test', 'error', 'error line');
    expect(stderr).toHaveBeenCalledTimes(2);
});

test('an invalid LOG_LEVEL throws listing the levels', () => {
    expect(() => createTransport({ LOG_LEVEL: 'verbose' })).toThrow('trace, debug, info, warn, error');
});
