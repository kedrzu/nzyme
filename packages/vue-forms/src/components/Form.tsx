import css from '#css/form.module.css';
import { computed, defineComponent, h } from 'vue';
import type { PropType } from 'vue';

import type { EventEmitter } from '@nzyme/utils';
import { classProp, defineSlots, onEventEmitter, onTrigger, provideContext } from '@nzyme/vue-utils';

import { FormContext } from '../FormContext.js';

/**
 *
 */
export const Form = defineComponent({
    // eslint-disable-next-line vue/no-reserved-component-names
    name: 'Form',
    props: {
        pendingClass: classProp,
        submitEvent: {} as PropType<EventEmitter<any>>,
        submitTrigger: Boolean,
    },
    emits: ['submit'],
    slots: defineSlots<{
        /**
         *
         */
        default: {
            /**
             *
             */
            pending: boolean;
            /**
             *
             */
            submit: FormContext['submit'];
        };
    }>(),
    setup(props, { slots }) {
        const ctx = provideContext(FormContext);
        const pending = computed(() => ctx.pending);

        onTrigger(() => props.submitTrigger, ctx.submit);
        if (props.submitEvent) {
            onEventEmitter(props.submitEvent, ctx.submit);
        }

        return () => (
            <form
                class={pending.value && props.pendingClass}
                inert={pending.value}
                novalidate
                onSubmit={onSubmit}
            >
                {/* This fake input allows to natively handle submit-on-enter */}
                <input
                    class={css.submit}
                    tabindex="-1"
                    type="submit"
                />
                {slots.default?.({ pending: pending.value, submit: ctx.submit })}
            </form>
        );

        function onSubmit(event: Event) {
            event.preventDefault();
            void ctx.submit();
        }
    },
});
