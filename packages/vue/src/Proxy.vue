<script lang="ts" setup generic="T">
import type { VNodeChild } from 'vue';

const props = defineProps<{ value: T }>();
const slots = defineSlots<{ default: (value: T) => VNodeChild }>();

const render = () => slots.default?.(props.value);
</script>

<template>
  <render />
</template>
