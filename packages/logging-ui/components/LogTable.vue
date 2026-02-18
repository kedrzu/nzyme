<script lang="ts" setup>
import type { LoggerLevel } from '@nzyme/logging/LoggerLevel.js';
import { AlertCircle, AlertTriangle, Bug, Ellipsis, Info, Search } from 'lucide-vue-next';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import { ref, watch, type Component } from 'vue';

import type { LogEntry } from '../types/LogEntry.js';

import LogJsonViewer from './LogJsonViewer.vue';

const MAX_MESSAGE_LENGTH = 200;

const props = defineProps<{
  logs: LogEntry[];
  getLoggerPathColor: (log: LogEntry) => string;
  getLoggerPathDisplay: (log: LogEntry) => string;
}>();

const expandedRows = ref<Record<string, boolean>>({});

// Reset expanded rows when logs are cleared
watch(
  () => props.logs,
  newLogs => {
    if (newLogs.length === 0) {
      // Clear all expansion state when logs are cleared
      expandedRows.value = {};
    } else {
      // Prune expanded rows that no longer exist in logs
      const logIds = new Set(newLogs.map(log => log.id));
      for (const id of Object.keys(expandedRows.value)) {
        if (!logIds.has(id)) {
          delete expandedRows.value[id];
        }
      }
    }
  },
);

/**
 * Format timestamp as HH:mm:ss.SSS
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

interface LevelStyle {
  icon: Component;
  textColor: string;
}

/**
 * Get level styling (icon, colors) for log level.
 */
function getLevelStyle(level: LoggerLevel): LevelStyle {
  switch (level) {
    case 'error':
      return { icon: AlertCircle, textColor: '#dc2626' };
    case 'warn':
      return { icon: AlertTriangle, textColor: '#d97706' };
    case 'info':
      return { icon: Info, textColor: '#2563eb' };
    case 'debug':
      return { icon: Bug, textColor: '#6b7280' };
    case 'trace':
      return { icon: Search, textColor: '#9ca3af' };
    default:
      return { icon: Info, textColor: '#6b7280' };
  }
}

/**
 * Toggle row expansion.
 */
function toggleRow(log: LogEntry): void {
  if (!isExpandable(log)) {
    return;
  }

  if (expandedRows.value[log.id]) {
    delete expandedRows.value[log.id];
  } else {
    expandedRows.value[log.id] = true;
  }
}

/**
 * Check if a log has expandable data.
 */
function hasData(log: LogEntry): boolean {
  return log.data !== undefined && Object.keys(log.data).length > 0;
}

/**
 * Check if the message exceeds the max display length.
 */
function isMessageTruncated(log: LogEntry): boolean {
  return log.message.length > MAX_MESSAGE_LENGTH;
}

/**
 * Check if a row should show the expand indicator.
 */
function isExpandable(log: LogEntry): boolean {
  return hasData(log) || isMessageTruncated(log);
}

/**
 * Get the display message, truncated unless expanded.
 */
function getDisplayMessage(log: LogEntry): string {
  if (expandedRows.value[log.id] || log.message.length <= MAX_MESSAGE_LENGTH) {
    return log.message;
  }
  return log.message.slice(0, MAX_MESSAGE_LENGTH) + '\u2026';
}
</script>

<template>
  <DataTable
    v-model:expanded-rows="expandedRows"
    :value="logs"
    data-key="id"
    scrollable
    scroll-height="flex"
    class="log-table"
    @row-click="e => toggleRow(e.data)"
  >
    <Column
      field="timestamp"
      header="Time"
      style="width: 120px"
    >
      <template #body="{ data }">
        <span class="mono-cell">{{ formatTime(data.timestamp) }}</span>
      </template>
    </Column>

    <Column
      field="logger"
      header="Logger"
    >
      <template #body="{ data }">
        <span
          class="logger-path"
          :style="{ color: props.getLoggerPathColor(data) }"
          :title="props.getLoggerPathDisplay(data)"
          >{{ props.getLoggerPathDisplay(data) }}</span
        >
      </template>
    </Column>

    <Column
      field="message"
      header="Message"
    >
      <template #body="{ data }">
        <span class="message-wrapper">
          <component
            :is="getLevelStyle(data.level).icon"
            :size="16"
            :color="getLevelStyle(data.level).textColor"
            :title="data.level"
            class="level-icon"
          />
          <span
            class="message-cell"
            :style="{ color: getLevelStyle(data.level).textColor }"
            >{{ getDisplayMessage(data) }}</span
          >
          <span
            v-if="isExpandable(data)"
            class="data-indicator"
            title="Click to expand"
            @click.stop="toggleRow(data)"
          >
            <Ellipsis :size="14" />
          </span>
        </span>
      </template>
    </Column>

    <template #expansion="{ data }">
      <LogJsonViewer
        v-if="hasData(data)"
        :log="data"
      />
    </template>
  </DataTable>
</template>

<style scoped>
.log-table {
  height: 100%;
  width: 100%;
  max-width: 100%;
  font-family: var(--font-sans);
}

.mono-cell {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.logger-path {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 700;
  white-space: nowrap;
}

.message-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.level-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.message-cell {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-word;
  min-width: 0;
}

.data-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background-color: #dbeafe;
  color: #3b82f6;
  flex-shrink: 0;
  cursor: pointer;
}

.data-indicator:hover {
  background-color: #bfdbfe;
}

:deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}

:deep(.p-datatable-tbody > tr:hover) {
  background-color: var(--p-surface-100);
}

:deep(.p-datatable-tbody > tr > td) {
  padding: 0.5rem 0.75rem;
  vertical-align: top;
}

:deep(.p-datatable-row-expansion > td) {
  padding: 0 !important;
}

/* Ensure table stays within container */
:deep(.p-datatable-table-container) {
  max-width: 100%;
  overflow-x: auto;
}

:deep(.p-datatable-table) {
  table-layout: auto;
  width: 100%;
}
</style>
