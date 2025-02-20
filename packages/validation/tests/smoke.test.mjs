import * as validation from '@nzyme/validation';

// Simple smoke test to verify the package can be imported
if (!validation) throw new Error('Package failed to load');
