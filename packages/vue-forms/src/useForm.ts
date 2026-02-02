import { computed } from 'vue';
import type { Ref } from 'vue';

import { useLanguage } from '@nzyme/vue-i18n';
import { reactive } from '@nzyme/vue-utils';

import type { FormField, FormModel } from './types.js';

/**
 * Create form model
 * @param value Initial form value
 * @returns Form model
 */
export function useForm<T>(value: Ref<T> | T): FormModel<T> {
    const fields = reactive<FormField[]>([]);
    const lang = useLanguage();

    const valid = computed(() => {
        return fields.every(field => field.valid);
    });

    const invalid = computed(() => {
        return fields.some(field => field.invalid);
    });

    const form = reactive<FormModel<T>>({
        value,
        fields,
        valid,
        invalid,
        lang,
        get form(): FormModel<T> {
            return form;
        },
        validate,
        reset,
    });

    return form;

    async function validate(): Promise<boolean> {
        const results = await Promise.all(fields.map(field => field.validate()));
        return results.every(result => result);
    }

    function reset() {
        for (const field of fields) {
            field.reset();
        }
    }
}
