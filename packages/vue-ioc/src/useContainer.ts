import { getCurrentInstance, inject, provide } from 'vue';

import type { ContainerScope } from '@nzyme/ioc/ContainerScope.js';

import type { VueContainer } from './createContainer.js';
import { injectionKey } from './injectionKey.js';

/** Retrieves the nearest IoC container from the Vue component hierarchy. */
export function useContainer() {
    const instance = getCurrentInstance() as {
        /** Internal Vue provides record for fast lookup without traversing ancestors. */
        provides?: { [key: string | symbol]: unknown };
    };
    let container = instance?.provides?.[injectionKey] as VueContainer | undefined;
    if (container) {
        return container;
    }

    container = inject(injectionKey);
    if (!container) {
        throw new Error('Container not registered. Register IocPlugin first');
    }

    return container;
}

/** Creates and provides a child IoC container scoped to the current component. */
export function useChildContainer(scope: ContainerScope) {
    const container = useContainer();
    const child = container.createChild(scope);

    provide(injectionKey, child);

    return child;
}
