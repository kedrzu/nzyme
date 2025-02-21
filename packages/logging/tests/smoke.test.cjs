const logging = require('@nzyme/logging');

// Simple smoke test to verify the package can be required
if (!logging) throw new Error('Package failed to load');
