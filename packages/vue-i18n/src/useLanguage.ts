import { computed } from 'vue';

import { LanguageContext } from '@nzyme/i18n';
import { useService } from '@nzyme/vue-ioc';

/**
 * Returns current language computed ref.
 */
export function useLanguage() {
    return computed(useService(LanguageContext));
}
