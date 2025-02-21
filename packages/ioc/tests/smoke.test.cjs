const ioc = require('@nzyme/ioc');

// Simple smoke test to verify the package can be required
if (!ioc) throw new Error('Package failed to load');
