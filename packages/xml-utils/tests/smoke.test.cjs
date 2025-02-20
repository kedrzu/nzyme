const xmlUtils = require('@nzyme/xml-utils');

// Simple smoke test to verify the package can be required
if (!xmlUtils) throw new Error('Package failed to load');
