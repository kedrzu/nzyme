const cryptoUtils = require('@nzyme/crypto-utils');

// Simple smoke test to verify the package can be required
if (!cryptoUtils) throw new Error('Package failed to load');
