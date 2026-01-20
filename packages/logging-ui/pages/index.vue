<script lang="ts" setup>
import type { LoggerLevel } from '@nzyme/logging';
import { AlertCircle, AlertTriangle, Bug, Info, Search } from 'lucide-vue-next';
import Button from 'primevue/button';
import MultiSelect from 'primevue/multiselect';
import Tag from 'primevue/tag';
import { computed, type Component } from 'vue';

import LogTable from '../components/LogTable.vue';
import { useLogStore } from '../composables/useLogStore.js';

const {
  logs,
  connected,
  hiddenLoggers,
  selectedLevels,
  uniqueLoggers,
  logLevels,
  clearLogs,
  getLoggerPathColor,
  getLoggerColorByPath,
  getLoggerPathDisplay,
} = useLogStore();

interface LoggerGroup {
  app: string;
  loggers: string[];
}

/**
 * Group loggers by app name for the MultiSelect.
 */
const loggerGroups = computed<LoggerGroup[]>(() => {
  const groups = new Map<string, string[]>();

  for (const logger of uniqueLoggers.value) {
    const slashIndex = logger.indexOf('/');
    const app = slashIndex > 0 ? logger.substring(0, slashIndex) : logger;

    let group = groups.get(app);
    if (!group) {
      group = [];
      groups.set(app, group);
    }
    group.push(logger);
  }

  return Array.from(groups.entries())
    .map(([app, loggers]) => ({ app, loggers }))
    .sort((a, b) => a.app.localeCompare(b.app));
});

/**
 * Computed model for visible loggers - translates between UI (selected = visible) and storage (hidden).
 * Uses exclusive logic: hiddenLoggers stores what's hidden, UI shows what's visible.
 */
const visibleLoggers = computed({
  get() {
    // Visible = all loggers EXCEPT those in hiddenLoggers
    return uniqueLoggers.value.filter(logger => !hiddenLoggers.value.includes(logger));
  },
  set(newVisibleLoggers: string[] | null | undefined) {
    // Handle null/undefined/empty from PrimeVue (e.g., on clear) as "show all"
    const visible = newVisibleLoggers ?? [];
    // Empty selection means show all (no hidden loggers)
    if (visible.length === 0) {
      hiddenLoggers.value = [];
      return;
    }
    // Hidden = all loggers EXCEPT visible
    hiddenLoggers.value = uniqueLoggers.value.filter(logger => !visible.includes(logger));
  },
});

/**
 * Get display name for a logger (remove app prefix if in a group).
 */
function getLoggerDisplayName(logger: string): string {
  const slashIndex = logger.indexOf('/');
  return slashIndex > 0 ? logger.substring(slashIndex + 1) : logger;
}

interface LevelConfig {
  icon: Component;
  color: string;
  label: string;
}

const levelConfigs: Record<LoggerLevel, LevelConfig> = {
  error: { icon: AlertCircle, color: '#dc2626', label: 'Error' },
  warn: { icon: AlertTriangle, color: '#d97706', label: 'Warning' },
  info: { icon: Info, color: '#2563eb', label: 'Info' },
  debug: { icon: Bug, color: '#6b7280', label: 'Debug' },
  trace: { icon: Search, color: '#9ca3af', label: 'Trace' },
};
</script>

<template>
  <div class="log-viewer">
    <header class="toolbar">
      <div class="filters">
        <MultiSelect
          v-model="visibleLoggers"
          :options="loggerGroups"
          option-group-label="app"
          option-group-children="loggers"
          placeholder="All Loggers"
          :max-selected-labels="2"
          filter
          filter-placeholder="Search loggers..."
          class="filter-select filter-select-loggers"
        >
          <template #optiongroup="{ option }">
            <span class="logger-group">{{ option.app }}</span>
          </template>
          <template #option="{ option }">
            <span
              class="logger-option"
              :style="{ color: getLoggerColorByPath(option) }"
              >{{ getLoggerDisplayName(option) }}</span
            >
          </template>
          <template #chip="{ value }">
            <span
              class="logger-chip"
              :style="{ color: getLoggerColorByPath(value) }"
              >{{ value }}</span
            >
          </template>
        </MultiSelect>
        <MultiSelect
          v-model="selectedLevels"
          :options="logLevels"
          placeholder="All Levels"
          :max-selected-labels="3"
          class="filter-select filter-select-levels"
        >
          <template #option="{ option }">
            <span
              class="level-option"
              :style="{ color: levelConfigs[option as LoggerLevel].color }"
            >
              <component
                :is="levelConfigs[option as LoggerLevel].icon"
                :size="14"
                class="level-option-icon"
              />
              {{ levelConfigs[option as LoggerLevel].label }}
            </span>
          </template>
          <template #chip="{ value }">
            <span
              class="level-chip"
              :style="{ color: levelConfigs[value as LoggerLevel].color }"
            >
              <component
                :is="levelConfigs[value as LoggerLevel].icon"
                :size="12"
                class="level-chip-icon"
              />
              {{ levelConfigs[value as LoggerLevel].label }}
            </span>
          </template>
        </MultiSelect>
      </div>

      <div class="actions">
        <Tag
          :value="connected ? 'Connected' : 'Disconnected'"
          :severity="connected ? 'success' : 'danger'"
          class="connection-status"
        />
        <Button
          label="Clear"
          icon="pi pi-trash"
          severity="secondary"
          size="small"
          @click="clearLogs"
        />
      </div>
    </header>

    <main class="table-container">
      <LogTable
        :logs="logs"
        :get-logger-path-color="getLoggerPathColor"
        :get-logger-path-display="getLoggerPathDisplay"
      />
    </main>
  </div>
</template>

<style scoped>
.log-viewer {
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

.filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.filter-select {
  min-width: 180px;
}

.filter-select-loggers {
  min-width: 220px;
}

.filter-select-levels {
  min-width: 150px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.connection-status {
  font-size: 0.75rem;
}

.table-container {
  flex: 1;
  overflow: hidden;
  max-width: 100%;
  min-width: 0;
}

.logger-chip {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
}

/* Level filter options */
.level-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}

.level-option-icon {
  flex-shrink: 0;
}

.level-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
}

.level-chip-icon {
  flex-shrink: 0;
}
</style>

<!-- Non-scoped styles for dropdown panel (rendered via teleport) -->
<style>
/* Logger group header in dropdown */
.logger-group {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}

/* Logger option in dropdown */
.logger-option {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 700;
}
</style>
