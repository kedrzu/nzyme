import type { TranslationResult } from '@nzyme/i18n-core/Translation.js';
import type { Language } from '@nzyme/i18n/Language.js';
import type { DataSourceDebounceOptions } from '@nzyme/vue-utils/useDataSource.js';
import type { MaybeRefOrGetter, Ref } from 'vue';

/** Base interface for form and field models with value, validation, and reset capabilities. */
export interface FormBase<T = unknown> {
    /**
     * Current form value
     */
    value: T;

    /**
     * Parent form
     */
    readonly form: FormModel<unknown>;

    /**
     * Whether the form is valid.
     */
    readonly valid: boolean;

    /**
     * Whether the form is invalid.
     * Can be false even when `valid` is false if form was not validated yet.
     */
    readonly invalid: boolean;

    /**
     * Validate form
     * @returns Promise that resolves to true if form is valid, false otherwise
     */
    readonly validate: () => Promise<boolean>;

    /**
     * Reset form validation state
     */
    readonly reset: () => void;
}

/**
 * Form model
 */
export interface FormModel<T = unknown> extends FormBase<T>, FormValidationContext {
    /**
     * Form fields registered in the form
     */
    readonly fields: readonly FormField[];
}

/**
 * Form field model
 * Extends FormModel to allow scoped sub-forms where nested fields can be registered
 */
export interface FormField<T = unknown> extends FormModel<T> {
    /**
     * Whether the field is focused
     */
    readonly focused: boolean;

    /**
     * Validation errors
     */
    readonly errors: string[];

    /**
     * Form validators
     */
    readonly validators: FormValidatorState[];

    /**
     * Focus the field
     */
    readonly focus: () => void;

    /**
     * Blur the field
     */
    readonly blur: () => void;
}

/**
 * Form validation result
 */
export type FormValidationResult = TranslationResult | false | null;

/**
 * Form validation context
 */
export interface FormValidationContext {
    /**
     * Current language
     */
    readonly lang: Language;
}

/** Runtime state of a single validator attached to a form field. */
export interface FormValidatorState {
    /**
     * Validation error
     */
    readonly error: string | null;

    /**
     * Whether to show the validation errors
     */
    show: boolean;

    /** Runs the validation and returns whether the field is valid. */
    readonly validate: () => boolean | Promise<boolean>;
}

/** Context passed to a validator's behavior function to control error visibility. */
export type FormValidatorBehaviorContext<T = unknown> = {
    /**
     * Current field value
     */
    readonly value: Readonly<Ref<T | null | undefined>>;

    /**
     * Whether the field is focused
     */
    readonly focused: Readonly<Ref<boolean>>;

    /**
     * Whether to show the validation errors
     */
    readonly show: Ref<boolean>;
};

/**
 * Form validator behavior function.
 * Drives whether the validation errors are shown.
 */
export interface FormValidatorBehavior<T = unknown> {
    (ctx: FormValidatorBehaviorContext<T>): void;
}

/**
 * Form validator sync
 * @template T - Type of the value being validated
 */
export type FormValidatorSync<T> = {
    /**
     * Whether the validator is async
     */
    readonly async?: false;

    /**
     * Validate value
     * @param value Value to validate
     * @param ctx Validation context
     * @returns Form validation result
     */
    readonly validate: (value: T | null | undefined, ctx: FormValidationContext) => FormValidationResult;

    /**
     * Form validator behavior
     */
    readonly behavior?: FormValidatorBehavior<T>;
};

/**
 * Form validation context async
 */
export interface FormValidationContextAsync<W = unknown> extends FormValidationContext {
    /**
     * Additional watch value.
     */
    readonly watch: W;
}

/**
 * Form validator async
 * @template T - Type of the value being validated
 * @template W - Type of the additional watch value
 */
export type FormValidatorAsync<T, W = unknown> = {
    /**
     * Whether the validator is async
     */
    readonly async: true;

    /**
     * Debounce time in milliseconds or debounce options
     */
    readonly debounce?: number | DataSourceDebounceOptions;

    /**
     * Additional watch value.
     * If provided, the validator will be re-evaluated when the value changes.
     * @example
     * const validator = defineValidator<string>({
     *   async: true,
     *   watch: () => ({ foo: someRef.value }),
     *   validate: (value, ctx) => {
     *     return value.length > 0 && ctx.watch.foo ? undefined : 'Value is required';
     *   },
     * });
     */
    readonly watch?: MaybeRefOrGetter<W>;

    /**
     * Validate value
     * @param value Value to validate
     * @param ctx Validation context
     * @returns Form validation result
     */
    readonly validate: (
        value: T | null | undefined,
        ctx: FormValidationContextAsync<W>,
    ) => Promise<FormValidationResult>;

    /**
     * Form validator behavior
     */
    readonly behavior?: (ctx: FormValidatorBehaviorContext<T>) => void;
};

/** Union of synchronous and asynchronous form validators for a given value type. */
export type FormValidator<T> = FormValidatorAsync<NonNullable<T>> | FormValidatorSync<NonNullable<T>>;
