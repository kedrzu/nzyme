import * as rollupUtils from '@nzyme/rollup-utils';

// Simple smoke test to verify the package can be imported
if (!rollupUtils) throw new Error('Package failed to load');
