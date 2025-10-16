import type { Ref } from 'vue';
import { computed, onScopeDispose, ref } from 'vue';

import { arrayRemove } from '@nzyme/utils';
import { computedAsync, reactive } from '@nzyme/vue-utils';

import type {
    FormField,
    FormModel,
    FormValidationContext,
    FormValidationResult,
    FormValidator,
    FormValidatorAsync,
    FormValidatorState,
    FormValidatorSync,
} from './types.js';

/**
 * Form field parameters
 */
export interface FormFieldParams<T> {
    /**
     * Field key
     */
    value: Ref<T>;

    /**
     *
     */
    validators?: FormValidator<T>[];
}

/**
 *
 */
export function useFormField<T>(form: FormModel, params: FormFieldParams<T>): FormField<T> {
    const focused = ref(false);
    const validators = reactive<FormValidatorState[]>(
        params.validators?.map(validator => createValidatorState(params.value, validator, form)) || [],
    );

    const errors = computed(() => {
        const errors: string[] = [];
        for (const validator of validators) {
            const error = validator.error;
            if (error) {
                errors.push(error);
            }
        }

        return errors;
    });

    const valid = computed(() => errors.value.length === 0);

    const field = reactive<FormField<T>>({
        form,
        value: params.value,
        valid,
        errors,
        focused,
        validators,
        validate,
        reset,
        focus,
        blur,
    });

    const formFields = form.fields as FormField[];

    // Register field in form
    formFields.push(field as FormField);

    // Unregister field from form when component is unmounted
    onScopeDispose(() => {
        arrayRemove(formFields, field as FormField);
    });

    return field;

    function focus() {
        focused.value = true;
    }

    function blur() {
        focused.value = false;
    }

    async function validate() {
        const promises: Promise<boolean>[] = [];
        let valid = true;

        for (const validator of validators) {
            const result = validator.validate();

            if (result instanceof Promise) {
                promises.push(result);
            } else {
                valid = valid && result;
            }
        }

        if (!valid) {
            return false;
        }

        if (promises.length > 0) {
            const results = await Promise.all(promises);
            return results.every(result => result);
        }

        return true;
    }

    function reset() {
        for (const validator of validators) {
            validator.reset();
        }
    }
}

function createValidatorState<T>(value: Readonly<Ref<T>>, validator: FormValidator<T>, ctx: FormValidationContext) {
    if (validator.async) {
        return createValidatorStateAsync(value, validator, ctx);
    } else {
        return createValidatorStateSync(value, validator, ctx);
    }
}

function createValidatorStateSync<T>(
    value: Readonly<Ref<T>>,
    validator: FormValidatorSync<T>,
    ctx: FormValidationContext,
) {
    const error = computed(() => normalizeErrors(validator.validate(value.value, ctx)));

    return reactive<FormValidatorState>({
        error,
        reset: () => void 0,
        validate: () => !!error.value,
    });
}

function createValidatorStateAsync<T>(
    value: Readonly<Ref<T>>,
    validator: FormValidatorAsync<T>,
    ctx: FormValidationContext,
) {
    const error = computedAsync(async () => normalizeErrors(await validator.validate(value.value, ctx)), {
        initialValue: null,
    });

    return reactive<FormValidatorState>({
        error,
        reset: () => void 0,
        validate: async () => {
            await error.get();
            return !!error.value;
        },
    });
}

function normalizeErrors(error: FormValidationResult) {
    if (!error) {
        return null;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (Array.isArray(error)) {
        return error.join('');
    }

    return null;
}
