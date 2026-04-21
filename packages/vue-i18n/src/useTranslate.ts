import { Translator } from '@nzyme/i18n/Translator.js';
import { useService } from '@nzyme/vue-ioc/useService.js';

/** Returns the Translator service from the IoC container for translating i18n messages. */
export function useTranslate() {
    return useService(Translator);
}
