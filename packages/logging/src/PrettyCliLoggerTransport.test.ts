import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import chalk from 'chalk';

import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { ApplicationError } from './ApplicationError.js';
import type { LoggerTransport } from './LoggerTransport.js';
import { PrettyCliLoggerTransport } from './PrettyCliLoggerTransport.js';

let stderr: ReturnType<typeof spyOn<Console, 'error'>>;

beforeEach(() => {
    stderr = spyOn(console, 'error').mockImplementation(() => {});
});

const initialChalkLevel = chalk.level;

afterEach(() => {
    chalk.level = initialChalkLevel;
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

/** The stderr output of the spy so far, ANSI stripped. */
function output(): string {
    return stderr.mock.calls.map(call => Bun.stripANSI(String(call[0]))).join('\n');
}

function logData(data: Record<string, unknown>, level: 'info' | 'error' = 'info'): string {
    createTransport({})('name', level, 'message', data);
    return output();
}

test('data prints as YAML with a gutter marker on every line and none on the message', () => {
    const text = logData({ staffId: 'stf_1', nested: { roles: ['doctor'], count: 2 } });

    expect(text.split('\n')).toEqual([
        '[name] message',
        '[name] › staffId: stf_1',
        '[name] › nested:',
        '[name] ›   roles:',
        '[name] ›     - doctor',
        '[name] ›   count: 2',
    ]);
});

test('continuation lines of a multi-line string keep the prefix and marker', () => {
    const lines = logData({ text: 'first\nsecond\nthird' }).split('\n');

    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines.slice(1)) {
        expect(line.startsWith('[name] › ')).toBe(true);
    }
    expect(lines.join('\n')).toContain('second');
});

test('values JSON could not express are rendered without throwing', () => {
    const circular: Record<string, unknown> = { id: 1 };
    circular.self = circular;

    const text = logData({
        fn: () => 1,
        missing: undefined,
        big: 10n,
        map: new Map([['a', 1]]),
        set: new Set(['x']),
        date: new Date('2026-01-02T03:04:05.000Z'),
        circular,
    });

    expect(text).not.toContain('fn');
    expect(text).not.toContain('missing');
    expect(text).toContain('› big: 10');
    expect(text).toMatch(/› map:\n\[name\] › {3}a: 1/);
    expect(text).toMatch(/› set:\n\[name\] › {3}- x/);
    expect(text).toContain('› date: 2026-01-02T03:04:05.000Z');
    expect(text).toMatch(/&a1/);
    expect(text).toMatch(/\*a1/);
});

test('data that cannot be serialised prints one placeholder line and does not throw', () => {
    const data = {
        get broken(): string {
            throw new Error('boom');
        },
    };

    expect(logData(data).split('\n')).toEqual(['[name] message', '[name] › [unserializable data]']);
});

test('an ApplicationError prints its stack, then its data as YAML without the logger', () => {
    const error = new ApplicationError('failed', { orderId: 'o1', details: { status: 502 } });
    const text = logData({ error }, 'error');
    const lines = text.split('\n');

    expect(lines[0]).toBe('[name] message');
    expect(text).toContain('[name]   at ');
    expect(text.indexOf('  at ')).toBeLessThan(text.indexOf('› orderId: o1'));
    expect(lines.at(-1)).toBe('[name] ›   status: 502');
});

test('a non-Error cause prints as YAML with the marker after the cause prefix', () => {
    const text = logData({ error: new Error('outer', { cause: { code: 'E1', info: { retry: true } } }) });

    expect(text).toContain('[name] Caused by:');
    expect(text).toContain('[name]   › code: E1');
    expect(text).toContain('[name]   ›   retry: true');
});

test('keys and values are coloured differently', () => {
    chalk.level = 1;
    createTransport({})('name', 'info', 'message', { key: 'value' });

    const line = String(stderr.mock.calls[1]?.[0]);
    // Each ANSI sequence starts after an ESC `[`; the one directly before the token opens its colour.
    const openingOf = (token: string): string | undefined =>
        line
            .split('\u001B[')
            .find(part => part.includes('m' + token))
            ?.split('m')[0];
    const keyOpen = openingOf('key');
    const valueOpen = openingOf('value');

    expect(keyOpen).toBeDefined();
    expect(valueOpen).toBeDefined();
    expect(keyOpen).not.toBe(valueOpen);
});
