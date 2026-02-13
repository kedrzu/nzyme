import { getCurrentScope, onMounted } from 'vue';

import { assert } from '@nzyme/utils/assert.js';

/**
 * The same as @see onMounted but remembers current effect scope.
 */
export function onMountedInScope(listener: () => unknown) {
    const scope = getCurrentScope();
    assert(scope, 'onMountedInScope() must be called inside a setup function.');
    onMounted(() => scope.run(listener));
}
