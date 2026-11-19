import { describe, expect, it } from 'bun:test';

import { parseTrustList } from './trust.js';

describe('parseTrustList', () => {
    it('reads nothing as no configuration', () => {
        expect(parseTrustList('\n')).toEqual([]);
    });

    it('reads configurations printed one after another', () => {
        const first = {
            id: 'a',
            type: 'github',
            repository: 'kedrzu/nzyme',
            file: 'release.yml',
            permissions: { publish: true },
        };
        const second = { id: 'b', type: 'gitlab', repository: 'group/project', file: '.gitlab-ci.yml' };
        const output = `\n${JSON.stringify(first, null, 2)}\n\n${JSON.stringify(second, null, 2)}\n\n`;

        expect(parseTrustList(output)).toEqual([first, second]);
    });
});
