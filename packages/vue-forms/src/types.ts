import type { Language, TranslationResult } from '@nzyme/i18n';

/**
 *
 */
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
     * Whether the form is valid
     */
    readonly valid: boolean;

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
 */
export interface FormField<T = unknown> extends FormBase<T> {
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
export type FormValidationResult = TranslationResult | false | null | undefined;

/**
 * Form validation context
 */
export interface FormValidationContext {
    /**
     * Current language
     */
    readonly lang: Language;
}

/**
 *
 */
export interface FormValidatorState {
    /**
     * Validation error
     */
    readonly error: string | null;

    /**
     *
     */
    readonly validate: () => boolean | Promise<boolean>;

    /**
     * Reset validation state
     */
    readonly reset: () => void;
}

/**
 *
 */
export type FormValidator<T> = FormValidatorAsync<T> | FormValidatorSync<T>;

/**
 * Form validator
 * @template T - Type of the value being validated
 * @template TAsync - Whether the validator is async
 */
export interface FormValidatorBase<T = unknown, TAsync extends boolean = boolean> {
    /**
     * Whether the validator is async
     */
    readonly async: TAsync;

    /**
     * Validate value
     * @param value {T} Value to validate
     * @param ctx {FormValidationContext} Validation context
     * @returns Form validation result
     */
    readonly validate: (
        value: T | null | undefined,
        ctx: FormValidationContext,
    ) => TAsync extends false
        ? FormValidationResult
        : TAsync extends true
          ? Promise<FormValidationResult>
          : FormValidationResult | Promise<FormValidationResult>;
}

/**
 *
 */
export type FormValidatorAsync<T> = FormValidatorBase<T, true>;

/**
 *
 */
export type FormValidatorSync<T> = FormValidatorBase<T, false>;
