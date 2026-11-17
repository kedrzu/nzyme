import { noAriaOnComponentInStory } from './noAriaOnComponentInStory.js';
import { noModuleState } from './noModuleState.js';
import { noUnusedNoSideEffectsResult } from './noUnusedNoSideEffectsResult.js';
import type { OxlintPlugin } from './oxlintTypes.js';

/**
 * The `nzyme` oxlint plugin, loaded through a `jsPlugins` entry pointing at this module's built
 * output. Rule ids are `nzyme/<rule name>`; `nzyme` is not one of oxlint's reserved plugin names.
 */
const plugin: Readonly<OxlintPlugin> = {
    meta: { name: 'nzyme' },
    rules: {
        'no-aria-on-component-in-story': noAriaOnComponentInStory,
        'no-module-state': noModuleState,
        'no-unused-no-side-effects-result': noUnusedNoSideEffectsResult,
    },
};

export default plugin;
