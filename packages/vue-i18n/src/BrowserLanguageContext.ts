import { ref } from 'vue';

import { LanguageContext, LanguageProvider } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';
import { defineService } from '@nzyme/ioc';
import { assignProps } from '@nzyme/utils';

/**
 * Browser language context.
 */
export interface BrowserLanguageContext extends LanguageContext {
    /**
     * Set the language.
     */
    set: (language: Language) => void;
}

/**
 * Service that detects the current language based on browser preferences and available languages.
 * Caches the detected language for performance.
 */
export const BrowserLanguageContext = defineService({
    name: 'BrowserLanguageContext',
    implements: LanguageContext,
    deps: {
        langProvider: LanguageProvider,
    },
    setup({ langProvider }) {
        const availableLanguages = langProvider();
        const initialLanguage = getStoredLanguage(availableLanguages) || getBestLanguageMatch(availableLanguages);
        const lang = ref<Language>(initialLanguage);
        const provider = () => lang.value;

        const ctx: BrowserLanguageContext = assignProps(provider, {
            set: (language: Language) => {
                const availableLanguages: Language[] = langProvider();
                if (availableLanguages.includes(language)) {
                    lang.value = language;
                    storeLanguage(language);
                }
            },
        });

        return ctx;
    },
});

/**
 * Gets the stored language from cookie if available and valid.
 *
 * @param availableLanguages - Array of available languages from the provider
 * @returns The stored language code if valid, null otherwise
 * @__NO_SIDE_EFFECTS__
 */
function getStoredLanguage(availableLanguages: string[]): Language | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'lang' && value && availableLanguages.includes(value)) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            return value as Language;
        }
    }

    return null;
}

/**
 * Stores the language in a cookie.
 *
 * @param language - The language code to store
 */
function storeLanguage(language: Language): void {
    if (typeof document === 'undefined') {
        return;
    }

    // Set cookie to expire in 1 year
    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    document.cookie = `lang=${language}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Gets the preferred language from browser languages based on available languages.
 * Falls back to the first available language if no match is found.
 * Caches the result for performance.
 *
 * @param availableLanguages - Array of available languages from the provider
 * @returns The best matching language code
 * @__NO_SIDE_EFFECTS__
 */
function getBestLanguageMatch(availableLanguages: Language[]): Language {
    if (typeof navigator === 'undefined') {
        return availableLanguages[0] || 'en';
    }

    const browserLanguages = (navigator.languages || [navigator.language]) as Language[];

    // First try exact matches
    for (const browserLang of browserLanguages) {
        if (availableLanguages.includes(browserLang)) {
            return browserLang;
        }
    }

    // Then try partial matches (e.g., 'en-US' matches 'en')
    for (const browserLang of browserLanguages) {
        const langCode = browserLang.split('-')[0] as Language | undefined;
        if (langCode && availableLanguages.includes(langCode)) {
            return langCode;
        }
    }

    // Fallback to first available language
    return availableLanguages[0]!;
}
