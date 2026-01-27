import type { Ref } from 'vue';
import { computed, onScopeDispose, ref, watch, watchEffect } from 'vue';

import { arrayRemove } from '@nzyme/utils';
import { makeRef, reactive, useDataSource } from '@nzyme/vue-utils';

import type {
    FormField,
    FormModel,
    FormValidationContext,
    FormValidationResult,
    FormValidator,
    FormValidatorBehaviorContext,
    FormValidatorState,
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

    const fields = reactive<FormField[]>([]);

    const valid = computed(() => {
        for (const validator of validators) {
            if (validator.error) {
                return false;
            }
        }

        // Also check nested fields
        for (const nestedField of fields) {
            if (!nestedField.valid) {
                return false;
            }
        }

        return true;
    });

    const field = reactive<FormField<T>>({
        form,
        value,
        fields,
        lang: form.lang,
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
        let isValid = true;

        for (const validator of validators) {
            const result = validator.validate();

            if (result instanceof Promise) {
                promises.push(result);
            } else {
                isValid = isValid && result;
            }
        }

        // Also validate nested fields
        for (const nestedField of fields) {
            promises.push(nestedField.validate());
        }

        if (promises.length > 0) {
            const results = await Promise.all(promises);
            return isValid && results.every(result => result);
        }

        return isValid;
    }

    function reset() {
        for (const validator of validators) {
            validator.show = false;
        }

        // Also reset nested fields
        for (const nestedField of fields) {
            nestedField.reset();
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
    validator: FormValidator<T> & { async?: false },
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
        error.value = normalizeErrors(validator.validate(value.value as NonNullable<T> | null | undefined, ctx));
    }
}

function createValidatorStateAsync<T>(
    validator: FormValidator<T> & { async: true },
    value: Readonly<Ref<T>>,
    focused: Readonly<Ref<boolean>>,
    ctx: FormValidationContext,
) {
    const watch = makeRef(validator.watch);

    const error = useDataSource({
        params: () => ({ value: value.value, watch: watch.value }),
        load: async params => {
            const result = await validator.validate(params.value as NonNullable<T> | null | undefined, {
                ...ctx,
                watch: params.watch,
            });
            return normalizeErrors(result);
        },
        default: null,
        debounce: validator.debounce,
        behavior: 'eager',
    });

    const show = ref(false);

    createValidatorBehavior(validator, value, focused, show);

    return reactive<FormValidatorState>({
        error,
        show,
        validate: async () => {
            await error.reload();
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

        validator.behavior(ctx as FormValidatorBehaviorContext<NonNullable<T>>);
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
