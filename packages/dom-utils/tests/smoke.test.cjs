const domUtils = require('@nzyme/dom-utils');

// Simple smoke test to verify the package can be required
if (!domUtils) throw new Error('Package failed to load');
