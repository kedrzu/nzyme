import { getCurrentInstance } from 'vue';

/**
 * Composable that provides access to the current Vue component instance.
 * Must be called within a setup function or composable context.
 *
 * @returns The current component instance
 * @throws Error if called outside of setup function
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useInstance } from '@nzyme/vue-utils/useInstance.js';
 *
 * const instance = useInstance();
 * console.log(instance.uid); // Component unique ID
 * console.log(instance.type.name); // Component name
 * </script>
 * ```
 */
export function useInstance() {
    const instance = getCurrentInstance();
    if (!instance) {
        throw new Error('Must be called in setup() function');
    }

    return instance;
}

/**
 * Composable that provides access to the current Vue component instance proxy.
 * The proxy provides access to the component's public properties and methods.
 *
 * @returns The current component instance proxy
 * @throws Error if called outside of setup function or proxy is not available
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useInstanceProxy } from '@nzyme/vue-utils/useInstance.js';
 *
 * const proxy = useInstanceProxy();
 * console.log(proxy.$el); // Component root element
 * console.log(proxy.$emit); // Emit function
 * </script>
 * ```
 */
export function useInstanceProxy() {
    const instance = useInstance();
    if (!instance.proxy) {
        throw new Error('Instance proxy not set');
    }

    return instance.proxy;
}
