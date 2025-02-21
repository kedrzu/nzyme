const slack = require('@nzyme/slack');

// Simple smoke test to verify the package can be required
if (!slack) throw new Error('Package failed to load');
