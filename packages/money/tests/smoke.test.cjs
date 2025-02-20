const money = require('@nzyme/money');

// Simple smoke test to verify the package can be required
if (!money) throw new Error('Package failed to load');
