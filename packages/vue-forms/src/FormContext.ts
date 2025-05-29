import { reactive, ref } from 'vue';

import { createEventEmitter } from '@nzyme/utils';
import { defineContext } from '@nzyme/vue-utils';
import { useEmitAsync } from '@nzyme/vue-utils';

interface FormContextEvents {
    /** Form submit failed. */
    submitFailed: unknown;
    /** Form submit was successful. */
    submitSucceed: void;
    /** Form submit was complete, no matter the result. */
    submitComplete: void;
}

export const FormContext = defineContext('FormContext', () => {
    const emitAsync = useEmitAsync();
    const events = createEventEmitter<FormContextEvents>();

    const pending = ref(false);

    return reactive({
        pending,
        submit,
        on: events.on,
        off: events.off,
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
            events.emit('submitSucceed');
        } catch (e) {
            events.emit('submitFailed', e);
            throw e;
        } finally {
            events.emit('submitComplete');
            pending.value = false;
        }
    }
});
