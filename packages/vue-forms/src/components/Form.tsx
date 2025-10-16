import { computed, defineComponent, h } from 'vue';

import { classProp, defineSlots, provideContext } from '@nzyme/vue-utils';

import { FormContext } from '../FormContext.js';
import css from '#css/form.module.css';

export const Form = defineComponent({
    // eslint-disable-next-line vue/no-reserved-component-names
    name: 'Form',
    props: {
        pendingClass: classProp,
    },
    emits: ['submit'],
    slots: defineSlots<{
        default: {
            pending: boolean;
            submit: () => void | Promise<void>;
        };
    }>(),
    setup(props, { slots }) {
        const ctx = provideContext(FormContext);
        const pending = computed(() => ctx.pending);

        return () => (
            <form
                class={pending.value && props.pendingClass}
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
