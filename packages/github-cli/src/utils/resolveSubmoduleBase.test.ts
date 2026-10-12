import { expect, test } from 'bun:test';

import { resolveSubmoduleBase } from './resolveSubmoduleBase.js';

test('the trunk is whatever the caller says it is, not a hardcoded name', () => {
    expect(resolveSubmoduleBase({ landingTrunk: 'develop', trunk: 'develop' })).toEqual({
        kind: 'trunk',
        trunk: 'develop',
    });
    expect(resolveSubmoduleBase({ landingTrunk: 'main', trunk: 'develop' }).kind).toBe('pin');
});
