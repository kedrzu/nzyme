/**
 *
 */
export type TranslationResult = string | unknown[] | undefined;

/**
 *
 */
export type Translation<T = void> = T extends void ? TranslationSimple : TranslationWithParams<T>;

/**
 *
 */
export type TranslationSimple = (lang: string) => TranslationResult;

/**
 *
 */
export type TranslationWithParams<T> = (lang: string, params: T) => TranslationResult;

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TranslationAny = Translation<any>;

/**
 *
 */
export type TranslationParams<T extends TranslationAny> = T extends Translation<infer P> ? P : never;
