import { expect } from 'vitest';

import { expectToEqualFully } from './matchers/expectToEqualFully.js';
import { expectToEqualPartially } from './matchers/expectToEqualPartially.js';

// oxlint-disable-next-line nzyme/no-module-state -- a Vitest setup file exists to register matchers as it loads.
expect.extend({
    toEqualFully: expectToEqualFully,
    toEqualPartially: expectToEqualPartially,
});
