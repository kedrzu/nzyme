<script lang="ts" setup>
import { parseStackTrace, type StackFrame } from '@nzyme/utils';
import { computed } from 'vue';

/**
 * Serialized error structure from the logging transport.
 */
export interface SerializedError {
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
  /** AggregateError's errors array */
  errors?: unknown[];
  [key: string]: unknown;
}

const props = defineProps<{
  error: SerializedError;
  title?: string;
  depth?: number;
}>();

const currentDepth = computed(() => props.depth ?? 0);
const maxDepth = 5; // Prevent infinite recursion

interface ParsedFrame {
  type: 'function' | 'simple' | 'raw';
  name?: string;
  filePath?: string;
  fileLink?: string;
  text?: string;
}

/**
 * Parse stack trace and add file links.
 */
const frames = computed<ParsedFrame[]>(() => {
  if (!props.error.stack) {
    return [];
  }

  const baseFrames = parseStackTrace(props.error.stack);

  return baseFrames.map((frame: StackFrame) => {
    if (frame.type === 'function') {
      const filePath = frame.filePath;
      // Extract the file path without line/column for the link
      const pathMatch = filePath.match(/^(.+?):(\d+):(\d+)$/);
      let fileLink: string | undefined;

      if (pathMatch) {
        const basePath = pathMatch[1]!;
        const line = pathMatch[2]!;
        const col = pathMatch[3]!;
        if (basePath.startsWith('/')) {
          // cursor://file/path:line:col format
          fileLink = `cursor://file${basePath}:${line}:${col}`;
        }
      } else if (filePath.startsWith('/')) {
        fileLink = `cursor://file${filePath}`;
      }

      return {
        type: 'function' as const,
        name: frame.name,
        filePath,
        fileLink,
      };
    }

    return frame;
  });
});

/**
 * Get additional data properties (excluding standard error props).
 */
const additionalData = computed(() => {
  const { name, message, stack, cause, errors, ...rest } = props.error;
  if (Object.keys(rest).length === 0) {
    return null;
  }
  return rest;
});

/**
 * Get AggregateError's errors array (only error-like items).
 */
const aggregateErrors = computed<SerializedError[]>(() => {
  if (!props.error.errors || !Array.isArray(props.error.errors)) {
    return [];
  }
  return props.error.errors.filter(isErrorLike);
});

/**
 * Check if this is an AggregateError.
 */
const isAggregateError = computed(() => {
  return props.error.name === 'AggregateError' || aggregateErrors.value.length > 0;
});

/**
 * Check if cause is an error-like object.
 */
function isErrorLike(value: unknown): value is SerializedError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.message === 'string' || typeof obj.stack === 'string' || typeof obj.name === 'string';
}

/**
 * Format a value for display.
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
</script>

<template>
  <div
    class="error-display"
    :class="{ 'is-nested': currentDepth > 0 }"
  >
    <div
      v-if="title || error.name"
      class="error-header"
    >
      <span class="error-name">{{ title || error.name || 'Error' }}</span>
    </div>

    <div class="error-content">
      <!-- Error message -->
      <div
        v-if="error.message"
        class="error-message"
      >
        {{ error.message }}
      </div>

      <!-- Additional data for ApplicationError -->
      <div
        v-if="additionalData"
        class="error-data"
      >
        <div
          v-for="(value, key) in additionalData"
          :key="key"
          class="error-data-item"
        >
          <span class="error-data-key">{{ key }}:</span>
          <span class="error-data-value">{{ formatValue(value) }}</span>
        </div>
      </div>

      <!-- Stack trace (hide for AggregateError if it has nested errors) -->
      <div
        v-if="frames.length > 0 && !isAggregateError"
        class="stack-trace"
      >
        <div
          v-for="(frame, index) in frames"
          :key="index"
          class="stack-line"
        >
          <template v-if="frame.type === 'function'">
            <span class="stack-at">at</span>
            <span class="stack-function">{{ frame.name }}</span>
            <span class="stack-location">
              (<a
                v-if="frame.fileLink"
                :href="frame.fileLink"
                class="stack-link"
                >{{ frame.filePath }}</a
              >
              <template v-else>{{ frame.filePath }}</template
              >)
            </span>
          </template>
          <template v-else-if="frame.type === 'simple'">
            <span class="stack-at">at</span>
            <span class="stack-text">{{ frame.text }}</span>
          </template>
          <template v-else>
            <span class="stack-text">{{ frame.text }}</span>
          </template>
        </div>
      </div>

      <!-- AggregateError's errors array -->
      <div
        v-if="aggregateErrors.length > 0 && currentDepth < maxDepth"
        class="aggregate-errors"
      >
        <div class="aggregate-errors-header">
          {{ aggregateErrors.length }} error{{ aggregateErrors.length > 1 ? 's' : '' }}:
        </div>
        <div class="aggregate-errors-list">
          <LogErrorDisplay
            v-for="(err, index) in aggregateErrors"
            :key="index"
            :error="err"
            :title="`Error ${index + 1}`"
            :depth="currentDepth + 1"
          />
        </div>
      </div>

      <!-- Error cause (recursive) -->
      <div
        v-if="error.cause && currentDepth < maxDepth"
        class="error-cause"
      >
        <LogErrorDisplay
          v-if="isErrorLike(error.cause)"
          :error="error.cause"
          title="Caused by"
          :depth="currentDepth + 1"
        />
        <div
          v-else
          class="cause-value"
        >
          <span class="cause-label">Caused by:</span>
          <span class="cause-text">{{ formatValue(error.cause) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.error-display {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  overflow: hidden;
  max-width: 100%;
}

.error-display.is-nested {
  margin-top: 0.75rem;
  border-color: #fed7aa;
  background-color: #fffbeb;
}

.error-header {
  padding: 0.5rem 0.75rem;
  background-color: #fee2e2;
  border-bottom: 1px solid #fecaca;
}

.is-nested .error-header {
  background-color: #fef3c7;
  border-bottom-color: #fed7aa;
}

.error-name {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  color: #dc2626;
}

.is-nested .error-name {
  color: #d97706;
}

.error-content {
  padding: 0.5rem 0.75rem;
  max-width: 100%;
  overflow: hidden;
}

.error-message {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: #991b1b;
  margin-bottom: 0.5rem;
  word-break: break-word;
}

.error-data {
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background-color: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
}

.error-data-item {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
}

.error-data-key {
  color: #6366f1;
  font-weight: 600;
  margin-right: 0.5rem;
}

.error-data-value {
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
}

.stack-trace {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.6;
  max-height: 300px;
  overflow-y: auto;
  overflow-x: auto;
  max-width: 100%;
}

.stack-line {
  padding: 0.125rem 0;
  color: #6b7280;
  white-space: nowrap;
}

.stack-line:not(:last-child) {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.stack-at {
  color: #9ca3af;
  margin-right: 0.5rem;
}

.stack-function {
  color: #2563eb;
  font-weight: 600;
  margin-right: 0.5rem;
}

.stack-location {
  color: #6b7280;
}

.stack-text {
  color: #6b7280;
}

.stack-link {
  color: #6b7280;
  text-decoration: underline;
  cursor: pointer;
}

.stack-link:hover {
  color: #2563eb;
}

.aggregate-errors {
  margin-top: 0.5rem;
}

.aggregate-errors-header {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  color: #7c3aed;
  margin-bottom: 0.5rem;
}

.aggregate-errors-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.error-cause {
  margin-top: 0.5rem;
}

.cause-value {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  padding: 0.5rem;
  background-color: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
}

.cause-label {
  color: #d97706;
  font-weight: 600;
  margin-right: 0.5rem;
}

.cause-text {
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
