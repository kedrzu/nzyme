import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

const PLUGINS = join(import.meta.dir, '..', 'plugins');
const FLAG = 'disable-model-invocation: true\n';

const PRACTICE_PLUGINS = [
    { plugin: 'nzyme-ui', skill: 'ui' },
    { plugin: 'nzyme-drizzle', skill: 'drizzle' },
    { plugin: 'nzyme-api-clients', skill: 'api-clients' },
];

describe.each(PRACTICE_PLUGINS)('$plugin', ({ plugin, skill }) => {
    const original = join(PLUGINS, 'nzyme', 'skills', skill);
    const copy = join(PLUGINS, plugin, 'skills', skill);

    test('its SKILL.md is the original without the flag', () => {
        const source = readFileSync(join(original, 'SKILL.md'), 'utf8');

        expect(source).toContain(FLAG);
        expect(readFileSync(join(copy, 'SKILL.md'), 'utf8')).toBe(source.replace(FLAG, ''));
    });

    test('its references are the original ones', () => {
        expect(realpathSync(join(copy, 'references'))).toBe(realpathSync(join(original, 'references')));
    });
});
