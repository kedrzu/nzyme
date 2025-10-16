import type { Ref } from 'vue';
import { computed, onScopeDispose, ref, watch, watchEffect } from 'vue';

import { arrayRemove } from '@nzyme/utils';
import { computedAsync, reactive } from '@nzyme/vue-utils';

import type {
    FormField,
    FormModel,
    FormValidationContext,
    FormValidationResult,
    FormValidator,
    FormValidatorAsync,
    FormValidatorBehaviorContext,
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
    const value = params.value;
    const validators = params.validators?.map(validator => createValidatorState(validator, value, focused, form)) || [];

    const errors = computed(() => {
        const errors: string[] = [];
        for (const validator of validators) {
            if (!validator.show) {
                continue;
            }

            const error = validator.error;
            if (error) {
                errors.push(error);
            }
        }

        return errors;
    });

    const valid = computed(() => {
        for (const validator of validators) {
            if (validator.error) {
                return false;
            }
        }

        return true;
    });

    const field = reactive<FormField<T>>({
        form,
        value,
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
            validator.show = false;
        }
    }
}

function createValidatorState<T>(
    validator: FormValidator<T>,
    value: Readonly<Ref<T>>,
    focused: Readonly<Ref<boolean>>,
    ctx: FormValidationContext,
) {
    if (validator.async) {
        return createValidatorStateAsync(validator, value, focused, ctx);
    } else {
        return createValidatorStateSync(validator, value, focused, ctx);
    }
}

function createValidatorStateSync<T>(
    validator: FormValidatorSync<T>,
    value: Readonly<Ref<T>>,
    focused: Readonly<Ref<boolean>>,
    ctx: FormValidationContext,
) {
    const error = ref<string | null>(null);
    const show = ref(false);

    watchEffect(refresh);
    createValidatorBehavior(validator, value, focused, show);

    return reactive<FormValidatorState>({
        error,
        show,
        validate: () => {
            refresh();
            show.value = true;
            return !error.value;
        },
    });

    function refresh() {
        error.value = normalizeErrors(validator.validate(value.value, ctx));
    }
}

function createValidatorStateAsync<T>(
    validator: FormValidatorAsync<T>,
    value: Readonly<Ref<T>>,
    focused: Readonly<Ref<boolean>>,
    ctx: FormValidationContext,
) {
    const error = computedAsync(
        async () => {
            const result = await validator.validate(value.value, ctx);
            return normalizeErrors(result);
        },
        { initialValue: null },
    );

    const show = ref(false);

    createValidatorBehavior(validator, value, focused, show);

    return reactive<FormValidatorState>({
        error,
        show,
        validate: async () => {
            await error.refresh();
            show.value = true;
            return !error.value;
        },
    });
}

function createValidatorBehavior<T>(
    validator: FormValidator<T>,
    value: Readonly<Ref<T>>,
    focused: Readonly<Ref<boolean>>,
    show: Ref<boolean>,
) {
    if (validator.behavior) {
        const ctx = reactive<FormValidatorBehaviorContext<T>>({
            value,
            focused,
            show,
        });

        validator.behavior(ctx);
        return;
    }

    // Default validator behavior

    let valueChanged = false;

    watch(value, () => {
        valueChanged = true;
        if (focused.value) {
            show.value = false;
        }
    });

    watch(focused, focusedValue => {
        if (!focusedValue && valueChanged) {
            show.value = true;
            valueChanged = false;
        }
    });

    watch(show, () => {
        valueChanged = false;
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
