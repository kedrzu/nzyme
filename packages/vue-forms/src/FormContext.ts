import { reactive, ref } from 'vue';

import { createEventEmitter } from '@nzyme/utils';
import { defineContext } from '@nzyme/vue-utils';
import { useEmitAsync } from '@nzyme/vue-utils';

/**
 * Form context
 */
export const FormContext = defineContext('FormContext', () => {
    const emitAsync = useEmitAsync();

    const submitFailed = createEventEmitter<unknown>();
    const submitSucceed = createEventEmitter<void>();
    const submitComplete = createEventEmitter<void>();

    const pending = ref(false);

    return reactive({
        pending,
        submit,
        events: {
            submitFailed: submitFailed.event,
            submitSucceed: submitSucceed.event,
            submitComplete: submitComplete.event,
        },
    });

    async function submit() {
        if (pending.value) {
            return;
        }

        try {
            // When submitting the form remove focus from active element
            // We do this, because we hide validation errors on focused elements.
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement) {
                activeElement.blur();
            }

            pending.value = true;
            await emitAsync('submit');
            submitSucceed.emit();
        } catch (e) {
            submitFailed.emit(e);
            throw e;
        } finally {
            submitComplete.emit();
            pending.value = false;
        }
    }
});
