const vueIoc = require('@nzyme/vue-ioc');

// Simple smoke test to verify the package can be required
if (!vueIoc) throw new Error('Package failed to load');
