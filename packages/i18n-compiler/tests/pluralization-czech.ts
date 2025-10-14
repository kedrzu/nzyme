import { czechPluralization, englishPluralization } from '@nzyme/i18n';
import type { PluralTranslation, Translation } from '@nzyme/i18n';

const itemsCount_cs: PluralTranslation<typeof czechPluralization, { count: number }> = {
    zero: () => 'žádné položky',
    one: () => 'jedna položka',
    few: params => [params.count, ' položky'],
    many: params => [params.count, ' položek'],
};

const itemsCount_en: PluralTranslation<typeof englishPluralization, { count: number }> = {
    zero: () => 'no items',
    one: () => 'one item',
    many: params => [params.count, ' items'],
};

export const itemsCount: Translation<{ count: number }> = (lang, params) => {
    switch (lang) {
        case 'cs':
            return czechPluralization.pluralize(params.count, itemsCount_cs)?.(params);
        case 'en':
            return englishPluralization.pluralize(params.count, itemsCount_en)?.(params);
    }
};
