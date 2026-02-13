import {
    createElementBlock,
    defineComponent,
    getCurrentInstance,
    h,
    openBlock,
    renderSlot,
    Transition,
    withCtx,
} from 'vue';
import type { ComponentPublicInstance } from 'vue';

import { getOuterHeight } from '@nzyme/dom-utils/getOuterHeight.js';
import { useElement } from '@nzyme/vue-utils/useElement.js';

import css from './Reveal.module.scss';

const fallbackKey = Symbol('fallback');

/**
 * Reveal component.
 */
export const Reveal = defineComponent({
    name: 'Reveal',
    emits: {
        beforeEnter: (vm: ComponentPublicInstance) => vm,
        enter: (vm: ComponentPublicInstance) => vm,
        afterEnter: (vm: ComponentPublicInstance) => vm,
        beforeLeave: (vm: ComponentPublicInstance) => vm,
        leave: (vm: ComponentPublicInstance) => vm,
        afterLeave: (vm: ComponentPublicInstance) => vm,
    },
    setup(_props, ctx) {
        const element = useElement<HTMLElement>();
        const vm = getCurrentInstance()!.proxy!;

        return () => {
            // Some manual hacking with slots to make sure it works.
            const Inner = withCtx(() => [
                renderSlot(ctx.slots, 'default', {}, () => [
                    (openBlock(),
                    createElementBlock('div', {
                        key: fallbackKey,
                    })),
                ]),
            ]);

            return (
                <div class={css.reveal}>
                    <div class={css.reveal_inner}>
                        <Transition
                            enterActiveClass={css.enterActive}
                            enterFromClass={css.enterFrom}
                            leaveActiveClass={css.leaveActive}
                            leaveFromClass={css.leaveFrom}
                            onAfterEnter={afterEnter}
                            onAfterLeave={afterLeave}
                            onBeforeEnter={beforeEnter}
                            onBeforeLeave={beforeLeave}
                            onEnter={enter}
                            onLeave={leave}
                        >
                            {Inner}
                        </Transition>
                    </div>
                </div>
            );
        };

        function beforeLeave(el: Element) {
            fixedHeight(el as HTMLElement);
            ctx.emit('beforeLeave', vm);
        }

        function leave() {
            ctx.emit('leave', vm);
        }

        function beforeEnter() {
            ctx.emit('beforeEnter', vm);
        }

        function enter(el: Element) {
            fixedHeight(el as HTMLElement);
            ctx.emit('enter', vm);
        }

        function afterEnter() {
            autoHeight();
            ctx.emit('afterEnter', vm);
        }

        function afterLeave() {
            autoHeight();
            ctx.emit('afterLeave', vm);
        }

        function fixedHeight(el: HTMLElement) {
            const height = getOuterHeight(el);
            element.value!.style.height = `${height}px`;
            element.value!.style.overflow = 'hidden';
            forceRepaint(el);
        }

        function autoHeight() {
            element.value!.style.overflow = '';
            element.value!.style.height = '';
        }

        function forceRepaint(el: HTMLElement) {
            // Force repaint to make sure the
            // animation is triggered correctly.
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            getComputedStyle(el).height;
        }
    },
});
