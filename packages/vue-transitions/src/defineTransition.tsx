import {
    Transition,
    TransitionGroup,
    type TransitionProps as TransitionPropsVue,
    type TransitionGroupProps as TransitionGroupPropsVue,
    defineComponent,
    type ExtractPropTypes,
    computed,
    type ComponentObjectPropsOptions,
    h,
} from 'vue';

import type { SomeObject } from '@nzyme/types';
import { defineProp } from '@nzyme/vue-utils';

/**
 * Transition props.
 */
export type TransitionProps = Omit<TransitionPropsVue, 'name' | `${string}Class` | 'css'> & {
    /**
     * Transition duration in milliseconds.
     */
    duration?: number;
};

type TransitionHook = (el: Element) => void;
type TransitionGetter<TProps extends ComponentObjectPropsOptions, TValue> = (
    props: ExtractPropTypes<TProps>,
) => TValue;
type TransitionProp<TProps extends ComponentObjectPropsOptions, TValue> =
    | TValue
    | TransitionGetter<TProps, TValue>;

type TransitionDefProps<TProps extends ComponentObjectPropsOptions = SomeObject> = {
    name: string;
    props?: TProps;
    enterFromClass?: TransitionProp<TProps, string>;
    enterActiveClass?: TransitionProp<TProps, string>;
    enterToClass?: TransitionProp<TProps, string>;
    appearFromClass?: TransitionProp<TProps, string>;
    appearActiveClass?: TransitionProp<TProps, string>;
    appearToClass?: TransitionProp<TProps, string>;
    leaveFromClass?: TransitionProp<TProps, string>;
    leaveActiveClass?: TransitionProp<TProps, string>;
    leaveToClass?: TransitionProp<TProps, string>;
};

/**
 * Transition group props.
 */
export type TransitionGroupProps = Omit<
    TransitionGroupPropsVue,
    'name' | `${string}Class` | 'css'
> & {
    /**
     * Transition duration in milliseconds.
     */
    duration?: number;
};

const TRANSITION_PROPS = {
    duration: Number,
    delay: Number,
    group: defineProp<boolean | undefined>({ type: Boolean }),
    mode: defineProp<'in-out' | 'out-in' | 'default'>(),
    onBeforeEnter: defineProp<TransitionHook | TransitionHook[]>(),
    onAfterEnter: defineProp<TransitionHook | TransitionHook[]>(),
    onBeforeLeave: defineProp<TransitionHook | TransitionHook[]>(),
    onAfterLeave: defineProp<TransitionHook | TransitionHook[]>(),
};

/*#__NO_SIDE_EFFECTS__*/
/**
 *
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
                    return (
                        <TransitionGroup
                            {...classes.value}
                            onBeforeEnter={onBeforeEnter}
                            onAfterEnter={onAfterEnter}
                            onBeforeLeave={onBeforeLeave}
                            onAfterLeave={onAfterLeave}
                        >
                            {ctx.slots.default?.()}
                        </TransitionGroup>
                    );
                }

                return (
                    <Transition
                        {...classes.value}
                        mode={props.mode ?? 'out-in'}
                        onBeforeEnter={onBeforeEnter}
                        onAfterEnter={onAfterEnter}
                        onBeforeLeave={onBeforeLeave}
                        onAfterLeave={onAfterLeave}
                    >
                        {ctx.slots.default?.()}
                    </Transition>
                );
            };

            function onBeforeEnter(el: Element) {
                onBeforeTransition(el);
                callHook(props.onBeforeEnter, el);
            }

            function onAfterEnter(el: Element) {
                onAfterTransition(el);
                callHook(props.onAfterEnter, el);
            }

            function onBeforeLeave(el: Element) {
                onBeforeTransition(el);
                callHook(props.onBeforeLeave, el);
            }

            function onAfterLeave(el: Element) {
                onAfterTransition(el);
                callHook(props.onAfterLeave, el);
            }

            function onBeforeTransition(el: Element) {
                if (!(el instanceof HTMLElement)) {
                    return;
                }

                if (props.duration) {
                    el.style.transitionDuration = `${props.duration / 1000}s`;
                }

                if (props.delay) {
                    el.style.transitionDelay = `${props.delay / 1000}s`;
                }
            }

            function onAfterTransition(el: Element) {
                if (el instanceof HTMLElement) {
                    el.style.transitionDuration = '';
                    el.style.transitionDelay = '';
                }
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
