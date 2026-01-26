<script lang="ts" setup>
import { NuxtPage } from '#components';
</script>

<template>
  <NuxtPage />
</template>

<style>
:root {
  --font-sans: 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

html,
body,
#__nuxt {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
  font-family: var(--font-sans);
}
</style>
