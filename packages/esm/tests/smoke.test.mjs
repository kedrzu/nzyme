import * as esm from '@nzyme/esm';

// Simple smoke test to verify the package can be imported
if (!esm) throw new Error('Package failed to load');
