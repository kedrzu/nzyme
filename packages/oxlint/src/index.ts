import { noUnusedNoSideEffectsResult } from './noUnusedNoSideEffectsResult.js';
import type { OxlintPlugin } from './oxlintTypes.js';

/**
 * The `nzyme` oxlint plugin, loaded through a `jsPlugins` entry pointing at this module's built
 * output. Rule ids are `nzyme/<rule name>`; `nzyme` is not one of oxlint's reserved plugin names.
 */
const plugin: OxlintPlugin = {
    meta: { name: 'nzyme' },
    rules: {
        'no-unused-no-side-effects-result': noUnusedNoSideEffectsResult,
    },
};

export default plugin;
