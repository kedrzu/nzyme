import * as slack from '@nzyme/slack';

// Simple smoke test to verify the package can be imported
if (!slack) throw new Error('Package failed to load');
