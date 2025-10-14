/**
 *
 */
export type TranslationRaw = {
    [lang: string]: string;
};

/**
 *
 */
export type TranslationDocument = {
    [key: string]: TranslationRaw;
};

/**
 *
 */
export type TranslationError = {
    /**
     *
     */
    column: number;
    /**
     *
     */
    key?: string;
    /**
     *
     */
    lang?: string;
    /**
     *
     */
    line: number;
    /**
     *
     */
    message: string;
};
