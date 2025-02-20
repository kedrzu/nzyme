const vueUtils = require('@nzyme/vue-utils');

// Simple smoke test to verify the package can be required
if (!vueUtils) throw new Error('Package failed to load');
