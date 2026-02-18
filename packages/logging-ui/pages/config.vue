<script lang="ts" setup>
import type { LoggerLevel } from '@nzyme/logging/LoggerLevel.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { ArrowLeft } from 'lucide-vue-next';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import SelectButton from 'primevue/selectbutton';
import { computed } from 'vue';

import { LOG_LEVELS, LogStore } from '../services/LogStore.js';

const logStore = useService(LogStore);

interface LevelOption {
  label: string;
  value: LoggerLevel;
  color: string;
}

const levelOptions: LevelOption[] = LOG_LEVELS.map(level => ({
  label: level.toUpperCase(),
  value: level,
  color: getLevelColor(level),
}));

function getLevelColor(level: LoggerLevel): string {
  switch (level) {
    case 'error':
      return '#dc2626';
    case 'warn':
      return '#d97706';
    case 'info':
      return '#2563eb';
    case 'debug':
      return '#6b7280';
    case 'trace':
      return '#9ca3af';
  }
}

interface LoggerRow {
  path: string;
  app: string;
  logger: string | null;
  displayName: string;
}

/**
 * Flatten logger paths into rows for the DataTable.
 */
const loggerRows = computed<LoggerRow[]>(() => {
  const rows: LoggerRow[] = [];
  for (const [, paths] of logStore.loggerPathsByApp) {
    for (const lp of paths) {
      rows.push({
        path: lp.path,
        app: lp.app,
        logger: lp.logger,
        displayName: lp.logger ?? '(app)',
      });
    }
  }
  return rows;
});

function onLevelChange(row: LoggerRow, level: LoggerLevel | null): void {
  logStore.setMinLevel(row.path, level);
}

/**
 * Check if there are any active filters.
 */
const hasActiveFilters = computed(() => {
  return logStore.loggerConfigs.size > 0;
});
</script>

<template>
  <div class="config-view">
    <header class="toolbar">
      <div class="nav">
        <NuxtLink
          to="/"
          class="back-link"
        >
          <ArrowLeft :size="16" />
          <span>Back to Logs</span>
        </NuxtLink>
      </div>

      <h1 class="title">Logger Filters</h1>

      <div class="actions">
        <Button
          label="Reset All"
          icon="pi pi-refresh"
          severity="secondary"
          size="small"
          :disabled="!hasActiveFilters"
          @click="logStore.resetLoggerConfigs()"
        />
      </div>
    </header>

    <main class="table-container">
      <DataTable
        :value="loggerRows"
        row-group-mode="subheader"
        group-rows-by="app"
        scrollable
        scroll-height="flex"
        class="filters-table"
        :pt="{
          table: { style: { tableLayout: 'fixed' } },
        }"
      >
        <Column
          field="app"
          header="App"
        />

        <template #groupheader="{ data }">
          <span class="app-group-header">{{ data.app }}</span>
        </template>

        <Column
          field="displayName"
          header="Logger"
          style="width: 30%"
        >
          <template #body="{ data }">
            <span
              class="logger-name"
              :style="{ color: logStore.getLoggerColorByPath(data.path) }"
            >
              {{ data.displayName }}
            </span>
          </template>
        </Column>

        <Column header="Min Level">
          <template #body="{ data }">
            <SelectButton
              :model-value="logStore.getMinLevel(data.path)"
              :options="levelOptions"
              option-label="label"
              option-value="value"
              :allow-empty="true"
              class="level-select"
              @update:model-value="(val: LoggerLevel | null) => onLevelChange(data, val)"
            />
          </template>
        </Column>
      </DataTable>

      <div
        v-if="loggerRows.length === 0"
        class="empty-state"
      >
        <p>No loggers have been seen yet.</p>
        <p class="hint">Logs will appear here once the application starts receiving them.</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.config-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background-color: var(--p-surface-0);
  border-bottom: 1px solid var(--p-surface-200);
  gap: 1rem;
  flex-shrink: 0;
}

.nav {
  flex: 1;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-primary-color);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
}

.back-link:hover {
  text-decoration: underline;
}

.title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0;
}

.actions {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
}

.table-container {
  flex: 1;
  overflow: hidden;
  padding: 1rem;
}

.filters-table {
  height: 100%;
}

.app-group-header {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--p-text-color);
  text-transform: uppercase;
}

.logger-name {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
}

.level-select {
  display: flex;
}

:deep(.level-select .p-selectbutton-option) {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.025em;
  padding: 0.35rem 0.6rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--p-text-muted-color);
  text-align: center;
}

.empty-state p {
  margin: 0.25rem 0;
}

.empty-state .hint {
  font-size: 0.875rem;
  opacity: 0.75;
}
</style>
