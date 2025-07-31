import type { AllowedComponentProps, ComponentPublicInstance, VNodeProps } from 'vue';

import type { Constructor } from '@nzyme/types';

/**
 * Component props type.
 */
export type ComponentProps<T> =
    T extends Constructor<ComponentPublicInstance>
        ? Omit<InstanceType<T>['$props'], keyof AllowedComponentProps | keyof VNodeProps>
        : void;

/**
 *
 */
export type ElementOrVue = ComponentPublicInstance | Document | Element | HTMLElement | SVGElement | Window;
