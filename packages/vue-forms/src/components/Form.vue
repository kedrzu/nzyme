<script lang="ts" setup>
/**
 * Form component that manages submission state and validation.
 *
 * It provides the `FormContext` to the fields inside it and emits `submit` (awaited) once a submission starts.
 */
import type { EventEmitterAny } from '@nzyme/utils/createEventEmitter.js';
import type { ClassProp } from '@nzyme/vue-utils/classProp.js';
import { provideContext } from '@nzyme/vue-utils/context.js';
import { onEventEmitter } from '@nzyme/vue-utils/onEventEmitter.js';
import { onTrigger } from '@nzyme/vue-utils/onTrigger.js';
import { computed, useCssModule } from 'vue';

import { FormContext } from '../FormContext.js';

interface FormProps {
  /** Class added to the form while a submission is in progress. */
  pendingClass?: ClassProp;
  /** Event that submits the form whenever it is emitted. */
  submitEvent?: EventEmitterAny;
  /** Submits the form whenever it turns `true`. */
  submitTrigger?: boolean;
}

const props = defineProps<FormProps>();
defineEmits<{
  submit: [event: Event];
}>();
defineSlots<{
  /** Default slot exposing form state and submit action. */
  default?(props: {
    /** Whether the form submission is in progress. */
    pending: boolean;
    /** Triggers form submission. */
    submit: FormContext['submit'];
  }): unknown;
}>();

const css = useCssModule('css');
const ctx = provideContext(FormContext);
const pending = computed(() => ctx.pending);

onTrigger(() => props.submitTrigger, ctx.submit);
if (props.submitEvent) {
  onEventEmitter(props.submitEvent, ctx.submit);
}

function onSubmit(event: Event) {
  event.preventDefault();
  void ctx.submit();
}
</script>

<template>
  <form
    :class="pending && pendingClass"
    :inert="pending"
    novalidate
    @submit="onSubmit"
  >
    <!-- This fake input allows to natively handle submit-on-enter -->
    <input
      :class="css.form_submit"
      tabindex="-1"
      type="submit"
    />
    <slot
      :pending="pending"
      :submit="ctx.submit"
    />
  </form>
</template>

<style module="css">
.form_submit {
  position: fixed;
  visibility: hidden;
  left: -9999px;
  top: -9999px;
}
</style>
