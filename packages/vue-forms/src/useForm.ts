import type { ValidationErrors } from '@nzyme/validation/Validator.js';
import { useLanguage } from '@nzyme/vue-i18n/useLanguage.js';
import { reactive } from '@nzyme/vue-utils/reactivity/reactive.js';
import { computed, getCurrentScope, ref, shallowReactive, shallowRef, toRef } from 'vue';
import type { Ref } from 'vue';

import { collectRuleErrors } from './rules/collectRuleErrors.js';
import type { RuleRegistration } from './rules/FormNodeState.js';
import { setFormNodeState } from './rules/FormNodeState.js';
import type { FormField, FormModel, FormValidatorState } from './types.js';

/**
 * Create form model
 * @param value Initial form value
 * @returns Form model
 */
export function useForm<T>(value: Ref<T> | T): FormModel<T> {
    const fields = reactive<FormField[]>([]);
    const lang = useLanguage();

    // A root form has no validators of its own, so rule messages with no field to receive them
    // are carried here, created by `useRules` on demand.
    const rules = shallowRef<FormValidatorState | null>(null);

    const valid = computed(() => {
        return fields.every(field => field.valid) && rules.value?.error == null;
    });

    const invalid = computed(() => {
        return fields.some(field => field.invalid) || isRulesErrorShown();
    });

    const form = reactive<FormModel<T>>({
        value,
        fields,
        valid,
        invalid,
        ruleErrors: computed((): ValidationErrors | null => collectRuleErrors(form)),
        lang,
        get form(): FormModel<T> {
            return form;
        },
        validate,
        reset,
    });

    setFormNodeState(form, {
        parent: null,
        addressable: true,
        scope: getCurrentScope(),
        value: toRef(form, 'value'),
        // A root form is never focused, so its rule errors show only after `validate()`.
        focused: ref(false),
        validators: null,
        registrations: shallowReactive<RuleRegistration[]>([]),
        rules,
    });

    return form;

    async function validate(): Promise<boolean> {
        const results = await Promise.all([...fields.map(field => field.validate()), rules.value?.validate() ?? true]);
        return results.every(result => result);
    }

    function reset() {
        for (const field of fields) {
            field.reset();
        }

        if (rules.value) {
            rules.value.show = false;
        }
    }

    function isRulesErrorShown() {
        return rules.value != null && rules.value.show && rules.value.error != null;
    }
}
