<script lang="ts" setup>
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { computed } from 'vue';

import type { LogEntry } from '../types/LogEntry.js';

import LogErrorDisplay, { type SerializedError } from './LogErrorDisplay.vue';

const props = defineProps<{
  log: LogEntry;
}>();

/**
 * Check if a value looks like a serialized error.
 */
function isErrorLike(value: unknown): value is SerializedError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    (typeof obj.message === 'string' && typeof obj.stack === 'string') ||
    (typeof obj.name === 'string' && typeof obj.stack === 'string')
  );
}

/**
 * Get the error from log data if present.
 */
const errorData = computed<SerializedError | null>(() => {
  const error = props.log.data?.error;
  if (isErrorLike(error)) {
    return error;
  }
  return null;
});

/**
 * Get remaining data without the error.
 */
const remainingData = computed<Record<string, unknown> | null>(() => {
  if (!props.log.data) {
    return null;
  }
  const { error, ...rest } = props.log.data;
  if (Object.keys(rest).length === 0) {
    return null;
  }
  return rest;
});

/**
 * Check if there's any data to display.
 */
const hasData = computed(() => {
  return errorData.value !== null || remainingData.value !== null;
});
</script>

<template>
  <div class="log-json-viewer">
    <div
      v-if="hasData"
      class="data-container"
    >
      <!-- Error display -->
      <LogErrorDisplay
        v-if="errorData"
        :error="errorData"
        class="error-section"
      />

      <!-- Remaining data -->
      <div
        v-if="remainingData"
        class="json-container"
      >
        <VueJsonPretty
          :data="remainingData"
          :deep="3"
          :show-length="true"
        />
      </div>
    </div>
    <div
      v-else
      class="no-data"
    >
      No additional data
    </div>
  </div>
</template>

<style scoped>
.log-json-viewer {
  background-color: var(--p-surface-50);
  max-width: 100%;
  overflow: hidden;
}

.data-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  max-width: 100%;
  overflow: hidden;
}

.error-section {
  /* Error display component handles its own styling */
}

.json-container {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
  max-width: 100%;
  overflow-x: auto;
}

.no-data {
  padding: 0.5rem 0.75rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  font-size: 0.875rem;
}

:deep(.vjs-tree) {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

/* Override vue-json-pretty colors for better contrast */
:deep(.vjs-key) {
  color: #6366f1; /* Indigo for keys */
}

:deep(.vjs-value-string) {
  color: #0d9488; /* Teal for strings - replaces neon green */
}

:deep(.vjs-value-number) {
  color: #7c3aed; /* Violet for numbers */
}

:deep(.vjs-value-boolean) {
  color: #ea580c; /* Orange for booleans */
}

:deep(.vjs-value-null),
:deep(.vjs-value-undefined) {
  color: #9ca3af; /* Gray for null/undefined */
}

:deep(.vjs-tree-brackets) {
  color: #64748b; /* Slate gray for brackets */
}

:deep(.vjs-indent-unit.has-line) {
  border-left-color: #e2e8f0; /* Light border for nesting lines */
}
</style>
