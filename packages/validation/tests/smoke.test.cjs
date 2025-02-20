const validation = require('@nzyme/validation');

// Simple smoke test to verify the package can be required
if (!validation) throw new Error('Package failed to load');
