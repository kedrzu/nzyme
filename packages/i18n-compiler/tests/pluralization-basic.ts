import { englishPluralization, polishPluralization } from '@nzyme/i18n';
import type { PluralTranslation, Translation } from '@nzyme/i18n';

const applesCount_pl: PluralTranslation<typeof polishPluralization, { container: unknown; count: number }> = {
    zero: params => ['zero jabłek w ', params.container],
    one: params => ['jedno jabłko w ', params.container],
    few: params => [params.count, ' jabłka w ', params.container],
    many: params => [params.count, ' jabłek w ', params.container],
};

const applesCount_en: PluralTranslation<typeof englishPluralization, { container: unknown; count: number }> = {
    zero: params => ['no apples in ', params.container],
    one: params => ['one apple in ', params.container],
    many: params => [params.count, ' apples in ', params.container],
};

export const applesCount: Translation<{ container: unknown; count: number }> = (lang, params) => {
    switch (lang) {
        case 'en':
            return englishPluralization.pluralize(params.count, applesCount_en)?.(params);
        case 'pl':
            return polishPluralization.pluralize(params.count, applesCount_pl)?.(params);
    }
};
