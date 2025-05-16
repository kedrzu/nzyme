import type { EffectScope, InjectionKey } from 'vue';
import { effectScope as createEffectScope, getCurrentScope } from 'vue';

import { createContainer as createContainerBase, type Container, type ContainerScope } from '@nzyme/ioc';
import type { Writable } from '@nzyme/types';

export const injectionKey = Symbol('container') as InjectionKey<VueContainer>;

export interface VueContainer extends Container {
    readonly effectScope: EffectScope;
    readonly injectionKey: typeof injectionKey;
    createChild(this: void, scope: ContainerScope): VueContainer;
}

export type VueContainerOptions = {
    parent?: VueContainer;
};

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
