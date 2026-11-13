import { expect, test } from 'bun:test';

import { SSMClient } from '@aws-sdk/client-ssm';

import { parameterStore } from './parameterStore.js';

interface Call {
    command: string;
    input: Record<string, unknown>;
}

interface FakeParameter {
    name: string;
    value: string;
}

/** An SSMClient answered in-process at the top of its middleware stack: no request is ever made. */
function fakeSsm(parameters: FakeParameter[], pageSize = 1000) {
    const calls: Call[] = [];
    const client = new SSMClient({ region: 'eu-west-1' });
    client.middlewareStack.add(
        (_next, context) => args => {
            const input: Record<string, unknown> = { ...args.input };
            const command = context.commandName ?? '';
            calls.push({ command, input });
            return Promise.resolve({ output: { $metadata: {}, ...respond(command, input) }, response: {} });
        },
        { step: 'initialize', name: 'fakeSsm' },
    );
    return { client, calls };

    function respond(command: string, input: Record<string, unknown>) {
        const offset = Number(input['NextToken'] ?? 0);
        const page = <T>(items: T[]) => ({
            items: items.slice(offset, offset + pageSize),
            NextToken: offset + pageSize < items.length ? String(offset + pageSize) : undefined,
        });
        if (command === 'GetParametersByPathCommand') {
            // Like the service: non-recursive means direct children only.
            const path = String(input['Path']);
            const { items, NextToken } = page(parameters.filter(p => p.name.startsWith(`${path}/`)));
            return { Parameters: items.map(p => ({ Name: p.name, Value: p.value })), NextToken };
        }

        if (command === 'DescribeParametersCommand') {
            const begins = filterValue(input['ParameterFilters']);
            const { items, NextToken } = page(parameters.filter(p => p.name.startsWith(begins)));
            return { Parameters: items.map(p => ({ Name: p.name })), NextToken };
        }

        if (command === 'GetParametersCommand') {
            const names = strings(input['Names']);
            return {
                Parameters: parameters.filter(p => names.includes(p.name)).map(p => ({ Name: p.name, Value: p.value })),
            };
        }

        return {};
    }
}

function filterValue(filters: unknown): string {
    const [filter] = Array.isArray(filters) ? (filters as unknown[]) : [];
    return typeof filter === 'object' && filter != null && 'Values' in filter ? (strings(filter.Values)[0] ?? '') : '';
}

function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

test('path prefix: readAll returns only direct children, keyed without the prefix, never a sibling path', async () => {
    const { client, calls } = fakeSsm([
        { name: '/secrets/dev/DB_URL', value: 'db' },
        { name: '/secrets/dev/API_KEY', value: 'api' },
        { name: '/secrets/dev2/LEAK', value: 'leak' },
        { name: '/secrets/dev/nested/DEEP', value: 'deep' },
    ]);
    const store = parameterStore({ prefix: '/secrets/dev', client });

    expect(store.id).toEndWith(':/secrets/dev/');
    expect(Object.fromEntries(await store.readAll())).toEqual({ DB_URL: 'db', API_KEY: 'api' });
    expect(calls[0]?.input).toMatchObject({ Path: '/secrets/dev', Recursive: false, WithDecryption: true });
});

test('name prefix: readAll returns only names starting with the prefix, stripped', async () => {
    const { client } = fakeSsm([
        { name: 'FOOBAR_A', value: 'a' },
        { name: 'FOOBAR_B', value: 'b' },
        { name: 'FOOBAR', value: 'no underscore' },
        { name: 'OTHER_A', value: 'other' },
    ]);
    const store = parameterStore({ prefix: 'FOOBAR_', client });

    expect(Object.fromEntries(await store.readAll())).toEqual({ A: 'a', B: 'b' });
});

test('path prefix: every page is read', async () => {
    const parameters = Array.from({ length: 5 }, (_, i) => ({ name: `/p/K${i}`, value: `v${i}` }));
    const { client, calls } = fakeSsm(parameters, 2);
    const result = await parameterStore({ prefix: '/p/', client }).readAll();

    expect([...result.keys()]).toEqual(['K0', 'K1', 'K2', 'K3', 'K4']);
    expect(calls.filter(c => c.command === 'GetParametersByPathCommand')).toHaveLength(3);
});

test('name prefix: every page is described and GetParameters is batched by at most 10, decrypted', async () => {
    const parameters = Array.from({ length: 25 }, (_, i) => ({ name: `N_${i}`, value: `v${i}` }));
    const { client, calls } = fakeSsm(parameters, 7);
    const result = await parameterStore({ prefix: 'N_', client }).readAll();

    expect(result.size).toBe(25);
    expect(calls.filter(c => c.command === 'DescribeParametersCommand')).toHaveLength(4);
    const gets = calls.filter(c => c.command === 'GetParametersCommand');
    expect(gets.map(c => strings(c.input['Names']).length)).toEqual([10, 10, 5]);
    expect(gets.every(c => c.input['WithDecryption'] === true)).toBe(true);
});

test('a failing read does not put values in the error', async () => {
    const { client } = fakeSsm([{ name: '/p/K', value: 'super-secret-value' }]);
    client.middlewareStack.add(() => () => Promise.reject(new Error('AccessDenied')), {
        step: 'initialize',
        name: 'failSsm',
        priority: 'high',
    });
    const error = await parameterStore({ prefix: '/p/', client })
        .readAll()
        .catch((e: unknown) => e);

    expect(String(error)).toContain('AccessDenied');
    expect(String(error)).not.toContain('super-secret-value');
});

test('write stores SecureString, Overwrite, standard tier, with the prefix prepended', async () => {
    const { client, calls } = fakeSsm([]);
    await parameterStore({ prefix: '/secrets/dev/', client }).write([
        { key: 'A', value: 'one' },
        { key: 'B', value: 'two' },
    ]);

    expect(calls.map(c => c.input)).toEqual([
        { Name: '/secrets/dev/A', Value: 'one', Type: 'SecureString', Overwrite: true, Tier: 'Standard' },
        { Name: '/secrets/dev/B', Value: 'two', Type: 'SecureString', Overwrite: true, Tier: 'Standard' },
    ]);
});

test('id differs by region, endpoint, profile and prefix', () => {
    const ids = [
        parameterStore({ prefix: '/s/' }).id,
        parameterStore({ prefix: '/s/', region: 'eu-west-1' }).id,
        parameterStore({ prefix: '/s/', endpoint: 'http://localhost:4566' }).id,
        parameterStore({ prefix: '/s/', profile: 'a' }).id,
        parameterStore({ prefix: '/s/', profile: 'b' }).id,
        parameterStore({ prefix: '/t/' }).id,
    ];

    expect(new Set(ids).size).toBe(ids.length);
});

test('an empty prefix is rejected', () => {
    expect(() => parameterStore({ prefix: '' })).toThrow('must not be empty');
});
