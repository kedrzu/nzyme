import { expect, test } from 'bun:test';

import { matchesGlob } from './matchesGlob.js';

test('matches a glob case-insensitively, anchored at both ends, with regex characters literal', () => {
    expect(matchesGlob('Ann@Sigma.Clinic', '*@sigma.clinic')).toBe(true);
    expect(matchesGlob('ann@sigma.clinic.evil.com', '*@sigma.clinic')).toBe(false);
    expect(matchesGlob('a+b@x.com', 'a+b@x.com')).toBe(true);
    expect(matchesGlob('axcom', 'a.com')).toBe(false);
});
