import { expect, test } from 'bun:test';

import { encodeGeohash } from './encodeGeohash.js';

test('encodes the reference points', () => {
    expect(encodeGeohash({ latitude: 57.64911, longitude: 10.40744, precision: 11 })).toBe('u4pruydqqvj');
    expect(encodeGeohash({ latitude: 42.6, longitude: -5.6, precision: 5 })).toBe('ezs42');
});
