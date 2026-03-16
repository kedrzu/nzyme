import css from '#css/form.module.css';
import { computed, defineComponent, h } from 'vue';
import type { PropType } from 'vue';

import type { EventEmitterAny } from '@nzyme/utils/createEventEmitter.js';
import { classProp } from '@nzyme/vue-utils/classProp.js';
import { provideContext } from '@nzyme/vue-utils/context.js';
import { onEventEmitter } from '@nzyme/vue-utils/onEventEmitter.js';
import { onTrigger } from '@nzyme/vue-utils/onTrigger.js';
import { defineSlots } from '@nzyme/vue-utils/slots.js';

import { FormContext } from '../FormContext.js';

/** Form component that manages submission state and validation. */
export const Form = defineComponent({
    // eslint-disable-next-line vue/no-reserved-component-names
    name: 'Form',
    props: {
        pendingClass: classProp,
        submitEvent: {} as PropType<EventEmitterAny>,
        submitTrigger: Boolean,
    },
    emits: {
        submit: (event: Event) => !!event,
    },
    slots: defineSlots<{
        /** Default slot exposing form state and submit action. */
        default: {
            /** Whether the form submission is in progress. */
            pending: boolean;
            /** Triggers form submission. */
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
