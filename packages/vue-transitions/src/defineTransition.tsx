import { computed, defineComponent, h, Transition, TransitionGroup } from 'vue';
import type {
    ComponentObjectPropsOptions,
    ExtractPropTypes,
    TransitionGroupProps as TransitionGroupPropsVue,
    TransitionProps as TransitionPropsVue,
} from 'vue';

import type { SomeObject } from '@nzyme/types/Object.js';
import type { ClassProp } from '@nzyme/vue-utils/classProp.js';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

import { onAfterTransition } from './utils/onAfterTransition.js';
import { onBeforeTransition } from './utils/onBeforeTransition.js';

/**
 * Transition props.
 */
export type TransitionProps = Omit<TransitionPropsVue, 'css' | 'name' | `${string}Class`> & {
    /**
     * Transition duration in milliseconds.
     */
    duration?: number;
};

/**
 * Transition group props.
 */
export type TransitionGroupProps = Omit<TransitionGroupPropsVue, 'css' | 'name' | `${string}Class`> & {
    /**
     * Transition duration in milliseconds.
     */
    duration?: number;
};
/**
 *
 */
export interface TransitionGroupOptions {
    /**
     *
     */
    tag?: string;
    /**
     *
     */
    class?: ClassProp;
}

type TransitionHook = (el: Element) => void;

type TransitionGetter<TProps extends ComponentObjectPropsOptions, TValue> = (props: ExtractPropTypes<TProps>) => TValue;

type TransitionProp<TProps extends ComponentObjectPropsOptions, TValue> = TransitionGetter<TProps, TValue> | TValue;

type TransitionDefProps<TProps extends ComponentObjectPropsOptions = SomeObject> = {
    appearActiveClass?: TransitionProp<TProps, string | undefined>;
    appearFromClass?: TransitionProp<TProps, string | undefined>;
    appearToClass?: TransitionProp<TProps, string | undefined>;
    enterActiveClass?: TransitionProp<TProps, string | undefined>;
    enterFromClass?: TransitionProp<TProps, string | undefined>;
    enterToClass?: TransitionProp<TProps, string | undefined>;
    leaveActiveClass?: TransitionProp<TProps, string | undefined>;
    leaveFromClass?: TransitionProp<TProps, string | undefined>;
    leaveToClass?: TransitionProp<TProps, string | undefined>;
    name: string;
    props?: TProps;
};

const TRANSITION_PROPS = {
    appear: Boolean,
    duration: Number,
    delay: Number,
    group: defineProp<boolean | TransitionGroupOptions | undefined>(),
    mode: defineProp<'default' | 'in-out' | 'out-in'>(),
    onBeforeEnter: defineProp<TransitionHook | TransitionHook[]>(),
    onAfterEnter: defineProp<TransitionHook | TransitionHook[]>(),
    onBeforeLeave: defineProp<TransitionHook | TransitionHook[]>(),
    onAfterLeave: defineProp<TransitionHook | TransitionHook[]>(),
};

/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineTransition<TProps extends ComponentObjectPropsOptions = SomeObject>(
    def: TransitionDefProps<TProps>,
) {
    return defineComponent({
        name: def.name,
        props: {
            ...TRANSITION_PROPS,
            // Undefined here breaks prop inference
            ...(def.props as TProps),
        },
        setup(props: ExtractPropTypes<typeof TRANSITION_PROPS>, ctx) {
            const classes = computed(() => {
                const p = props as ExtractPropTypes<TProps>;

                return {
                    enterFromClass: resolveProp(p, def.enterFromClass),
                    enterActiveClass: resolveProp(p, def.enterActiveClass),
                    enterToClass: resolveProp(p, def.enterToClass),
                    appearFromClass: resolveProp(p, def.appearFromClass),
                    appearActiveClass: resolveProp(p, def.appearActiveClass),
                    appearToClass: resolveProp(p, def.appearToClass),
                    leaveFromClass: resolveProp(p, def.leaveFromClass),
                    leaveActiveClass: resolveProp(p, def.leaveActiveClass),
                    leaveToClass: resolveProp(p, def.leaveToClass),
                };
            });

            return () => {
                if (props.group) {
                    let tag = 'div';
                    let cls: ClassProp | undefined;
                    if (typeof props.group === 'object') {
                        tag = props.group.tag ?? 'div';
                        cls = props.group.class;
                    }

                    const transitionProps = {
                        class: cls,
                        tag,
                        ...classes.value,
                        onAfterEnter: onAfterEnter,
                        onAfterLeave: onAfterLeave,
                        onBeforeEnter: onBeforeEnter,
                        onBeforeLeave: onBeforeLeave,
                    };

                    return <TransitionGroup {...transitionProps}>{ctx.slots.default?.()}</TransitionGroup>;
                }

                return (
                    <Transition
                        {...classes.value}
                        appear={props.appear}
                        mode={props.mode ?? 'out-in'}
                        onAfterEnter={onAfterEnter}
                        onAfterLeave={onAfterLeave}
                        onBeforeEnter={onBeforeEnter}
                        onBeforeLeave={onBeforeLeave}
                    >
                        {ctx.slots.default?.()}
                    </Transition>
                );
            };

            function onBeforeEnter(el: Element) {
                onBeforeTransition(el, props);
                callHook(props.onBeforeEnter, el);
            }

            function onAfterEnter(el: Element) {
                onAfterTransition(el);
                callHook(props.onAfterEnter, el);
            }

            function onBeforeLeave(el: Element) {
                onBeforeTransition(el, props);
                callHook(props.onBeforeLeave, el);
            }

            function onAfterLeave(el: Element) {
                onAfterTransition(el);
                callHook(props.onAfterLeave, el);
            }
        },
    });
}

function callHook(hooks: TransitionHook | TransitionHook[] | null | undefined, el: Element) {
    if (hooks == null) {
        return;
    }

    if (Array.isArray(hooks)) {
        for (const hook of hooks) {
            hook(el);
        }
    } else {
        hooks(el);
    }
}

function resolveProp<TProps extends ComponentObjectPropsOptions, TValue>(
    props: ExtractPropTypes<TProps>,
    value: TransitionProp<TProps, TValue> | undefined,
) {
    if (value == null) {
        return undefined;
    }

    if (typeof value === 'function') {
        return (value as TransitionGetter<TProps, TValue>)(props);
    }

    return value as TValue;
}
