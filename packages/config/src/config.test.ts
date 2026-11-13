import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createContainer } from '@nzyme/ioc/Container.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { ConfigSource } from './ConfigSource.js';
import { defineConfig } from './defineConfig.js';
import { envSource } from './envSource.js';
import { fileSource } from './fileSource.js';
import { loadConfig } from './loadConfig.js';
import { RuntimeConfig } from './RuntimeConfig.js';

const SENTINEL = 'sentinel-config-value-9c1d';

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nzyme-config-'));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function memorySource(name: string, entries: Record<string, string>): ConfigSource {
    return { name, load: () => Promise.resolve(entries) };
}

test('resolves required and optional values, including falsy ones', () => {
    const container = createContainer();
    const Required = defineConfig<{ readonly enabled: boolean }>('required');
    const Optional = defineConfig('optional', { required: false });
    const False = defineConfig<boolean>('false');
    const Null = defineConfig<null>('null');
    const Empty = defineConfig('empty');
    container.set(RuntimeConfig, { required: { enabled: true }, false: false, null: null, empty: '' });

    expect(container.resolve(Required)).toEqual({ enabled: true });
    expect(container.resolve(Optional)).toBeUndefined();
    expect(container.resolve(False)).toBe(false);
    expect(container.resolve(Null)).toBeNull();
    expect(container.resolve(Empty)).toBe('');
});

test('fails naming the interface when no document was installed', () => {
    const container = createContainer();
    const Key = defineConfig('key');

    expect(() => container.resolve(Key)).toThrow('Interface RuntimeConfig was not found');
});

test('a missing required key throws naming the key and the caller', () => {
    const container = createContainer();
    const Missing = defineConfig('missing');
    const Consumer = defineService({ name: 'ConfigConsumer', deps: { value: Missing }, setup: ({ value }) => value });
    container.set(RuntimeConfig, {});

    expect(() => container.resolve(Consumer)).toThrow('Runtime config key missing is not set. Caller: ConfigConsumer');
});

test('meta is typed through to the definition', () => {
    const Secret = defineConfig('secret', { meta: { secret: true, scope: 'api' } });
    const Plain = defineConfig('plain');

    const secret: boolean = Secret.meta.secret;
    const scope: string = Secret.meta.scope;
    expect(secret).toBe(true);
    expect(scope).toBe('api');
    expect(Plain.meta).toEqual({});
    // @ts-expect-error meta of a definition declared without any has no keys
    expect(Plain.meta.secret).toBeUndefined();
});

test('the first source wins per key and overridden keys are reported by name, never value', async () => {
    const { container, logs } = createTestContainer();
    await loadConfig(container, [
        memorySource('first', { A: SENTINEL, B: 'b1' }),
        memorySource('second', { B: 'b2', C: 'c2' }),
    ]);

    expect(container.resolve(RuntimeConfig)).toEqual({ A: SENTINEL, B: 'b1', C: 'c2' });
    expect(logs.find(log => log.message === 'Config loaded')?.data).toEqual({
        sources: ['first', 'second'],
        keys: 3,
        overridden: ['B'],
    });
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
    expect(JSON.stringify(logs)).not.toContain('b2');
});

test('envSource takes only non-empty entries, so an empty variable never shadows a later source', async () => {
    expect(await envSource({ A: 'a', B: undefined, C: '' }).load()).toEqual({ A: 'a' });
});

test('fileSource reads a JSON document; an absent optional file contributes nothing, a required one throws', async () => {
    const present = join(dir, 'config.json');
    writeFileSync(present, JSON.stringify({ A: 'a', N: { x: 1 } }));
    const absent = join(dir, 'absent.json');

    expect(await fileSource({ path: present }).load()).toEqual({ A: 'a', N: { x: 1 } });
    expect(await fileSource({ path: absent, optional: true }).load()).toEqual({});
    expect(() => fileSource({ path: absent }).load()).toThrow();
});
