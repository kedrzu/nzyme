import type { EffectScope } from 'vue';
import { effectScope as createEffectScope, getCurrentScope } from 'vue';

import { createContainer as createContainerBase } from '@nzyme/ioc/Container.js';
import type { Container } from '@nzyme/ioc/Container.js';
import type { ContainerScope } from '@nzyme/ioc/ContainerScope.js';
import type { Writable } from '@nzyme/types/Common.js';

import { injectionKey } from './injectionKey.js';

/** IoC container that runs service resolution within a Vue effect scope. */
export interface VueContainer extends Container {
    /** The Vue effect scope used for reactive dependency tracking. */
    readonly effectScope: EffectScope;
    /** The Vue injection key used to provide/inject this container. */
    readonly injectionKey: typeof injectionKey;
    /** Creates a child container that inherits from this one. */
    createChild(this: void, scope: ContainerScope): VueContainer;
}

/** Options for creating a VueContainer. */
export type VueContainerOptions = {
    /** Parent container to inherit registrations from. */
    parent?: VueContainer;
};

/** Creates a Vue-aware IoC container that resolves services within a Vue effect scope. */
export function createContainer(options?: VueContainerOptions): VueContainer {
    const parent = options?.parent;
    const effectScope = parent ? (getCurrentScope() ?? parent.effectScope) : createEffectScope(true);

    const container = createContainerBase({
        parent,
        createChild: () => createContainer({ parent: container }),
        resolve: (resolvable, scope) => {
            const current = getCurrentScope();

            if (current === effectScope) {
                return resolvable.resolve(container, scope);
            }

            return effectScope.run(() => {
                return resolvable.resolve(container, scope);
            });
        },
    }) as Writable<VueContainer>;

    container.effectScope = effectScope;
    container.injectionKey = injectionKey;

    return container;
}
