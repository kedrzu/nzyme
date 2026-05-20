<script lang="ts" setup generic="T">
import type { Translation } from '@nzyme/i18n-core/Translation.js';
import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import type { Slot } from 'vue';

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

  // The slot keys come from `T`'s shape (via `defineSlots<{[K in keyof T]: []}>()`),
  // but `Object.entries` widens to a `Record<string, unknown>` view that doesn't
  // preserve the mapped-key relation. Crossing back to `T` at the API boundary
  // here is intentional.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return props.t(lang(), params as T);
};
</script>

<template>
  <render />
</template>
