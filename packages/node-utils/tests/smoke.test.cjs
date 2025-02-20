const nodeUtils = require('@nzyme/node-utils');

// Simple smoke test to verify the package can be required
if (!nodeUtils) throw new Error('Package failed to load');
