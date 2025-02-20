import * as cryptoUtils from '@nzyme/crypto-utils';

// Simple smoke test to verify the package can be imported
if (!cryptoUtils) throw new Error('Package failed to load');
