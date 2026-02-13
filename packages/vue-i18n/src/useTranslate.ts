import { Translator } from '@nzyme/i18n/Translator.js';
import { useService } from '@nzyme/vue-ioc/useService.js';

/**
 *
 */
export function useTranslate() {
    return useService(Translator);
}
