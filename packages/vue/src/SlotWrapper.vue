<script lang="ts" setup generic="T">
import type { VNodeChild } from 'vue';
import { h } from 'vue';

import { isVNodeEmpty } from '@nzyme/vue-utils';

interface SlotWrapperProps {
  slot?: (slotProps: T) => VNodeChild | undefined;
  props?: T;
  tag?: string;
}

const props = defineProps<SlotWrapperProps>();

const render = () => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const nodes = props.slot?.(props.props as T);
  const tag = props.tag ?? 'div';

  console.log(nodes);

  const isEmpty = isVNodeEmpty(nodes);
  console.log(isEmpty);
  if (isEmpty) {
    return null;
  }

  return h(tag, nodes ?? undefined);
};
</script>

<template>
  <render />
</template>
