const fetchUtils = require('@nzyme/fetch-utils');

// Simple smoke test to verify the package can be required
if (!fetchUtils) throw new Error('Package failed to load');
