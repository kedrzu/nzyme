<script lang="ts" setup generic="T">
import type { Translation } from '@nzyme/i18n';
import type { Slot } from 'vue';

const props = defineProps<{
  t: Translation<T>;
}>();

const slots = defineSlots<{
  [K in keyof T]: [];
}>();

const render = () => {
  const lang = 'pl';
  const params: Record<string, unknown> = {};
  for (const [key, slot] of Object.entries(slots)) {
    if (key !== 't') {
      params[key] = (slot as Slot)?.();
    }
  }

  return props.t(lang, params as T);
};
</script>

<template>
  <render />
</template>
