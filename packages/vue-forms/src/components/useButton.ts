import { computed, reactive, ref } from 'vue';
import type { PropType } from 'vue';

import { assignProps, waitFor } from '@nzyme/utils';
import { injectContext, useProps } from '@nzyme/vue-utils';
import { defineProps, useEmitAsync } from '@nzyme/vue-utils';

import { FormContext } from '../FormContext.js';

const BUTTON_PROPS = defineProps({
    type: {
        type: String as PropType<'button' | 'submit'>,
        default: 'button',
    },
    busy: {
        type: Boolean,
        default: false,
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    preventDefault: {
        type: Boolean,
        default: false,
    },
});

const BUTTON_EMITS = {
    click: (event: Event) => !!event,
};

export interface ButtonProps {
    type?: 'button' | 'submit';
    busy?: boolean;
    disabled?: boolean;
    preventDefault?: boolean;
}

export interface ButtonEmits {
    click: Event;
}

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export const useButton = assignProps(setupButton, {
    props: BUTTON_PROPS,
    emits: BUTTON_EMITS,
});

function setupButton() {
    const props = useProps<ButtonProps>();
    const emitAsync = useEmitAsync<ButtonEmits>();
    const formCtx = injectContext(FormContext, { optional: true });
    const pending = ref(false);

    const busy = computed(() => {
        if (props.busy || pending.value) {
            return true;
        }

        if (formCtx?.pending && props.type === 'submit') {
            return true;
        }

        return false;
    });

    const disabled = computed(() => props.disabled);

    return reactive({
        busy,
        disabled,
        attrs: {
            disabled,
            type: computed(() => props.type),
            onClick,
        },
    });

    async function onClick(event: Event) {
        event.stopPropagation();
        if (props.preventDefault) {
            event.preventDefault();
        }

        if (props.disabled || pending.value) {
            return;
        }

        try {
            pending.value = true;

            if (props.type === 'submit') {
                event.preventDefault();
                await formCtx?.submit();
            }

            const result = emitAsync('click', event);
            if (result instanceof Promise) {
                await result;
                // Wait a little longer to allow for the click event to propagate.
                await waitFor(50);
            }
        } finally {
            pending.value = false;
        }
    }
}
