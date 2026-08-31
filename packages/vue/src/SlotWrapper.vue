<script lang="ts" setup generic="T">
import { isVNodeEmpty } from '@nzyme/vue-utils/isVNodeEmpty.js';
import type { VNodeChild } from 'vue';
import { h } from 'vue';

interface SlotWrapperProps {
  slot?: (slotProps: T) => VNodeChild | undefined;
  props?: T;
  tag?: string;
}

const props = defineProps<SlotWrapperProps>();

const render = () => {
  // `props.props` is `T | undefined` (because the prop itself is optional), but
  // `slot` accepts `T`. Crossing `undefined` to `T` here is the documented
  // contract — slots that pass no props rely on the implementation to ignore
  // the argument.
  const nodes = props.slot?.(props.props as T);
  const tag = props.tag ?? 'div';

  const isEmpty = isVNodeEmpty(nodes);
  if (isEmpty) {
    return null;
  }

  return h(tag, nodes ?? undefined);
};
</script>

<template>
  <render />
</template>
