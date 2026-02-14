import { getCurrentInstance, inject, provide } from 'vue';

import type { ContainerScope } from '@nzyme/ioc/ContainerScope.js';

import { injectionKey } from './createContainer.js';
import type { VueContainer } from './createContainer.js';

/**
 *
 */
export function useContainer() {
    const instance = getCurrentInstance() as {
        /**
         *
         */
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

/**
 *
 */
export function useChildContainer(scope: ContainerScope) {
    const container = useContainer();
    const child = container.createChild(scope);

    provide(injectionKey, child);

    return child;
}
