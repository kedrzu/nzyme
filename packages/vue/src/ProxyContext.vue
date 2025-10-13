<script lang="ts" setup generic="T">
import type { VNodeChild } from 'vue';

const props = defineProps<{ ctx: () => T }>();
const slots = defineSlots<{ default: (props: { ctx: T }) => VNodeChild }>();
const ctxValue = props.ctx();

const render = () => slots.default?.({ ctx: ctxValue });
</script>

<template>
  <render />
</template>
