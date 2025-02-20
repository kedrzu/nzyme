const markdown = require('@nzyme/markdown');

// Simple smoke test to verify the package can be required
if (!markdown) throw new Error('Package failed to load');
