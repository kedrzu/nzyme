<script lang="ts" setup generic="T">
import type { Slot } from 'vue';

import type { Translation } from '@nzyme/i18n-core/Translation.js';
import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { useService } from '@nzyme/vue-ioc/useService.js';

const props = defineProps<{
  t: Translation<T>;
}>();

const slots = defineSlots<{
  [K in keyof T]: [];
}>();

const lang = useService(LanguageContext);

const render = () => {
  const params: Record<string, unknown> = {};
  for (const [key, slot] of Object.entries(slots)) {
    params[key] = (slot as Slot)?.();
  }

  return props.t(lang(), params as T);
};
</script>

<template>
  <render />
</template>
