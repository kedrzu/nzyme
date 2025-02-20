const zchema = require('@nzyme/zchema');

// Simple smoke test to verify the package can be required
if (!zchema) throw new Error('Package failed to load');
