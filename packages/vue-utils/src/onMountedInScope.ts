import { getCurrentScope, onMounted } from 'vue';

/**
 * The same as @see onMounted but remembers current effect scope.
 */
export function onMountedInScope(listener: () => unknown) {
    const scope = getCurrentScope();
    if (!scope) {
        onMounted(listener);
        return;
    }

    onMounted(() => scope.run(listener));
}
