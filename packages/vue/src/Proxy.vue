<script lang="ts" setup generic="T">
import type { VNodeChild } from 'vue';

defineProps<{ value: T }>();
defineSlots<{ default: (value: T) => VNodeChild }>();
</script>

<template>
  <slot v-bind="value" />
</template>
