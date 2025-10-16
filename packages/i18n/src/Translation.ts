/**
 *
 */
export type TranslationResult = string | unknown[] | undefined;

/**
 *
 */
export type Translation<T = void> = T extends void
    ? (lang: string) => TranslationResult
    : (lang: string, params: T) => TranslationResult;

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TranslationAny = Translation<any>;

/**
 *
 */
export type TranslationParams<T extends TranslationAny> = T extends Translation<infer P> ? P : never;
