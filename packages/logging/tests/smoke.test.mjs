import * as logging from '@nzyme/logging';

// Simple smoke test to verify the package can be imported
if (!logging) throw new Error('Package failed to load');
