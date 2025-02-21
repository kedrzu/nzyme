import * as projectUtils from '@nzyme/project-utils';

// Simple smoke test to verify the package can be imported
if (!projectUtils) throw new Error('Package failed to load');
