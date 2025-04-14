import { computed, type PropType, reactive, ref } from 'vue';

import { assignProps, waitFor } from '@nzyme/utils';
import { defineProps, injectContext, useProps } from '@nzyme/vue-utils';
import { useEmitAsync } from '@nzyme/vue-utils';

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

/*#__NO_SIDE_EFFECTS__*/
export const useButton = assignProps(setupButton, {
    props: BUTTON_PROPS,
    emits: BUTTON_EMITS,
});

/*#__NO_SIDE_EFFECTS__*/
function setupButton() {
    const props = useProps(BUTTON_PROPS);
    const emitAsync = useEmitAsync(BUTTON_EMITS);
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

    function onClick(event: Event) {
        event.stopPropagation();
        if (props.preventDefault) {
            event.preventDefault();
        }

        if (props.disabled || pending.value) {
            return;
        }

        if (props.type === 'submit') {
            event.preventDefault();
            void formCtx?.submit();
        } else {
            void onClickAsync(event);
        }
    }

    async function onClickAsync(event: Event) {
        try {
            pending.value = true;
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
