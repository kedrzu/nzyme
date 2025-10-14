import { englishPluralization, polishPluralization } from '@nzyme/i18n';
import type { PluralTranslation, Translation } from '@nzyme/i18n';

export const greeting: Translation<{ name: unknown }> = (lang, params) => {
    switch (lang) {
        case 'en':
            return ['Hello ', params.name, '!'];
        case 'pl':
            return ['Witaj ', params.name, '!'];
    }
};

const itemsCount_pl: PluralTranslation<typeof polishPluralization, { count: number }> = {
    zero: () => 'brak elementów',
    one: () => 'jeden element',
    few: params => [params.count, ' elementy'],
    many: params => [params.count, ' elementów'],
};

const itemsCount_en: PluralTranslation<typeof englishPluralization, { count: number }> = {
    zero: () => 'no items',
    one: () => 'one item',
    many: params => [params.count, ' items'],
};

export const itemsCount: Translation<{ count: number }> = (lang, params) => {
    switch (lang) {
        case 'en':
            return englishPluralization.pluralize(params.count, itemsCount_en)?.(params);
        case 'pl':
            return polishPluralization.pluralize(params.count, itemsCount_pl)?.(params);
    }
};

export const farewell: Translation = lang => {
    switch (lang) {
        case 'en':
            return 'Goodbye!';
        case 'pl':
            return 'Do widzenia!';
    }
};
