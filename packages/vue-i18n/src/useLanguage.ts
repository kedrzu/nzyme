import { computed } from 'vue';
import type { ComputedRef } from 'vue';

import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { useService } from '@nzyme/vue-ioc/useService.js';

/**
 * Returns current language computed ref.
 */
export function useLanguage(): ComputedRef<ReturnType<LanguageContext>> {
    return computed(useService(LanguageContext));
}
