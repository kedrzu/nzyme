import * as nodeUtils from '@nzyme/node-utils';

// Simple smoke test to verify the package can be imported
if (!nodeUtils) throw new Error('Package failed to load');
