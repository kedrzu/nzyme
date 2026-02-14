<script lang="ts" setup>
import type { LoggerLevel } from '@nzyme/logging/LoggerLevel.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { ArrowLeft } from 'lucide-vue-next';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import { computed } from 'vue';

import { LOG_LEVELS, LogStore } from '../services/LogStore.js';

const logStore = useService(LogStore);

interface LevelConfig {
  color: string;
  label: string;
}

const levelConfigs: Record<LoggerLevel, LevelConfig> = {
  error: { color: '#dc2626', label: 'ERROR' },
  warn: { color: '#d97706', label: 'WARN' },
  info: { color: '#2563eb', label: 'INFO' },
  debug: { color: '#6b7280', label: 'DEBUG' },
  trace: { color: '#9ca3af', label: 'TRACE' },
};

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
  for (const [app, paths] of logStore.loggerPathsByApp) {
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

/**
 * Check if a level is enabled for a row.
 */
function isLevelChecked(row: LoggerRow, level: LoggerLevel): boolean {
  return logStore.isLevelEnabled(row.path, level);
}

/**
 * Toggle a level for a row.
 */
function onLevelToggle(row: LoggerRow, level: LoggerLevel): void {
  logStore.toggleLevel(row.path, level);
}

/**
 * Check if all levels are enabled for a row.
 */
function isAllChecked(row: LoggerRow): boolean {
  return logStore.isLoggerFullyEnabled(row.path);
}

/**
 * Check if row has some but not all levels enabled (indeterminate state).
 */
function isAllIndeterminate(row: LoggerRow): boolean {
  return logStore.isLoggerPartiallyEnabled(row.path);
}

/**
 * Toggle all levels for a row.
 */
function onAllToggle(row: LoggerRow): void {
  logStore.toggleAllLevels(row.path);
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
          style="width: 40%"
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

        <Column
          header="All"
          style="width: 60px"
          class="level-column"
        >
          <template #body="{ data }">
            <Checkbox
              :model-value="isAllChecked(data)"
              :indeterminate="isAllIndeterminate(data)"
              binary
              @update:model-value="onAllToggle(data)"
            />
          </template>
        </Column>

        <Column
          v-for="level in LOG_LEVELS"
          :key="level"
          :header="levelConfigs[level].label"
          style="width: 90px"
          class="level-column"
        >
          <template #body="{ data }">
            <div class="level-cell">
              <Checkbox
                :model-value="isLevelChecked(data, level)"
                binary
                :pt="{
                  box: {
                    style: {
                      borderColor: levelConfigs[level].color,
                      background: isLevelChecked(data, level) ? levelConfigs[level].color : 'transparent',
                    },
                  },
                }"
                @update:model-value="onLevelToggle(data, level)"
              />
              <span
                class="level-label"
                :style="{ color: levelConfigs[level].color }"
              >
                {{ levelConfigs[level].label }}
              </span>
            </div>
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

.level-column {
  text-align: center;
}

.level-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.level-label {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.025em;
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
