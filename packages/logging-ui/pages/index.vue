<script lang="ts" setup>
import { useService } from '@nzyme/vue-ioc';
import { Settings } from 'lucide-vue-next';
import Button from 'primevue/button';
import Tag from 'primevue/tag';

import LogTable from '../components/LogTable.vue';
import { LogStore } from '../services/LogStore.js';

const logStore = useService(LogStore);
</script>

<template>
    <div class="log-viewer">
        <header class="toolbar">
            <div class="nav">
                <NuxtLink to="/config" class="config-link">
                    <Settings :size="16" />
                    <span>Filters</span>
                </NuxtLink>
            </div>

            <div class="actions">
                <Tag
                    :value="logStore.connected ? 'Connected' : 'Disconnected'"
                    :severity="logStore.connected ? 'success' : 'danger'"
                    class="connection-status"
                />
                <Button
                    label="Clear"
                    icon="pi pi-trash"
                    severity="secondary"
                    size="small"
                    @click="logStore.clearLogs()"
                />
            </div>
        </header>

        <main class="table-container">
            <LogTable
                :logs="logStore.logs"
                :get-logger-path-color="logStore.getLoggerPathColor"
                :get-logger-path-display="logStore.getLoggerPathDisplay"
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

.nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.config-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--p-primary-color);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
}

.config-link:hover {
    text-decoration: underline;
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
</style>
