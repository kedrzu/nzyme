import { describe, expect, it } from 'bun:test';

import { getIndexSettings } from './IndexSettings.js';
import { parseIndexConfig } from './NzymeIndexConfig.js';

describe('parseIndexConfig', () => {
    it('treats a missing config as empty', () => {
        expect(parseIndexConfig(undefined)).toEqual({});
    });

    it('accepts the full shape', () => {
        const config = {
            globalUtilPackages: ['@acme/utils'],
            defineKinds: [{ kind: 'actor', section: 'Actors', callee: 'defineActor', nameKey: 'type', order: 40 }],
            entities: { tableFunctions: ['pgTable'], packages: ['@acme/database'] },
        };

        expect(parseIndexConfig(config)).toEqual(config);
    });

    it('names the offending path of a malformed config', () => {
        expect(() => parseIndexConfig([])).toThrow('`nzyme.index` must be an object');
        expect(() => parseIndexConfig({ globalUtilPackages: ['ok', 1] })).toThrow(
            '`nzyme.index.globalUtilPackages[1]` must be a non-empty string',
        );
        expect(() => parseIndexConfig({ defineKinds: [{ kind: 'actor', section: 'Actors' }] })).toThrow(
            '`nzyme.index.defineKinds[0].callee` must be a non-empty string',
        );
        expect(() => parseIndexConfig({ entities: {} })).toThrow(
            '`nzyme.index.entities.tableFunctions` must be an array of strings',
        );
    });
});

describe('getIndexSettings', () => {
    it('defaults to the built-in kinds, no UTILS.md packages and no entities', () => {
        const settings = getIndexSettings({});

        expect(settings.defineKinds.map(kind => kind.callee)).toEqual([
            'defineService',
            'defineCommand',
            'defineFactory',
            'defineEndpoint',
        ]);
        expect(settings.globalUtilPackages.size).toBe(0);
        expect(settings.entities).toBeNull();
    });

    it('slots configured kinds in by order, defaulting the name key and order', () => {
        const settings = getIndexSettings({
            defineKinds: [
                { kind: 'job', section: 'Jobs', callee: 'defineJob' },
                { kind: 'actor', section: 'Actors', callee: 'defineActor', nameKey: 'type', order: 40 },
            ],
        });

        expect(settings.defineKinds.map(kind => [kind.kind, kind.nameKey, kind.order])).toEqual([
            ['service', 'name', 10],
            ['command', 'name', 20],
            ['factory', 'name', 30],
            ['actor', 'type', 40],
            ['endpoint', 'name', 50],
            ['job', 'name', 55],
        ]);
    });

    it('rejects a configured kind that clashes with a built-in one', () => {
        expect(() => getIndexSettings({ defineKinds: [{ kind: 'util', section: 'U', callee: 'defineUtil' }] })).toThrow(
            'already defined',
        );
        expect(() =>
            getIndexSettings({ defineKinds: [{ kind: 'svc', section: 'S', callee: 'defineService' }] }),
        ).toThrow('already indexed');
    });
});
