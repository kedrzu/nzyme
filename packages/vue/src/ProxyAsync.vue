<script lang="ts" setup generic="T">
import { computedAsync } from '@vueuse/core';
import type { VNodeChild } from 'vue';

const props = defineProps<{ value: Promise<T> }>();
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
const slots = defineSlots<{ default: (value: T | undefined) => VNodeChild }>();

const value = computedAsync(() => props.value);

const render = () => slots.default?.(value.value);
</script>

<template>
  <render />
</template>
