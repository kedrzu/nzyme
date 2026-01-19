<script lang="ts" setup>
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';

import type { LogEntry } from '../types/LogEntry.js';

defineProps<{
    log: LogEntry;
}>();
</script>

<template>
    <div class="log-json-viewer">
        <div v-if="log.data && Object.keys(log.data).length > 0" class="json-container">
            <VueJsonPretty :data="log.data" :deep="3" :show-length="true" />
        </div>
        <div v-else class="no-data">No additional data</div>
    </div>
</template>

<style scoped>
.log-json-viewer {
    background-color: var(--p-surface-50);
}

.json-container {
    padding: 0.5rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.5;
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
