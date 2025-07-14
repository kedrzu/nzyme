import { Translator } from '@nzyme/i18n';
import { useService } from '@nzyme/vue-ioc';

/**
 *
 */
export function useTranslate() {
    return useService(Translator);
}
