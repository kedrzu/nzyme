# Nuxt app

A Nuxt 4 app package with nothing implicit: no auto-imports, no file-based routes, one path alias,
one IoC container. The app talks to whatever API the repo has; this element does not prescribe a
backend. Components come from the UI package (`references/ui-package.md`); how they are built is
`../ui/SKILL.md`.

## Reference state

```
packages/{{app}}/
├── package.json          # assets/app-package.json.tmpl
├── nuxt.config.ts
├── tsconfig.json         # hand-written, committed
├── shims.d.ts            # build-time constants
├── app.vue
├── app/router.options.ts # every route
├── layouts/default.vue
├── plugins/iocPlugin.ts  # the container; other plugins depend on it
├── .env, .env.<ENV>      # gitignored, hashed by `appEnvironment`
└── <feature>/            # screens and their components, by feature
```

- **`package.json`** — `assets/app-package.json.tmpl`. `build` is `nuxt generate`, whose output is
  static files in `.output/public` for both answers below. `typecheck` (`nuxi typecheck`) runs after
  `prep` (`nuxt prepare`, which writes `.nuxt/tsconfig.json`) through the `nx.json` target defaults,
  and `build` depends on `typecheck`.
- **`tsconfig.json`** extends `.nuxt/tsconfig.json`, so `nzyme monorepo` does not generate it (the app
  has no `tsconfig.esm.json`). Un-ignore it: `!/packages/{{app}}/tsconfig.json` in `.gitignore`
  (`references/monorepo.md`).
- **Lint:** the app imports `.vue` files, so it gets a `files` entry in the `.oxlintrc.json` override
  (`references/lint-format.md`).
- **Setup:** `setup.build.sh` keeps its `{{if nuxt}}` block (`references/setup-scripts.md`).

## SPA or SSR — the one question

Ask it in a new repo; in an existing one the config already answers it.

- **Behind a sign-in (an app):** `ssr: false`. `nuxt generate` writes an SPA shell and `200.html`
  for the static host's fallback. No server, no hydration mismatches, no SSR-safe code to write.
- **Public and found by search (a site, a landing page):** `ssr: true` and prerendering, still
  through `nuxt generate`. Merged into the config below:

  ```ts
  ssr: true,
  nitro: { prerender: { routes: ['/'], crawlLinks: true, failOnError: true } },
  // `Reveal`, `Collapse`, `Carousel` and the transitions of `@nzyme/vue` import CSS modules from
  // `.tsx` files, which Nuxt's per-component style inlining misses: without these two, their CSS
  // arrives with the chunk at hydration and a carousel renders stacked until then (layout shift).
  features: { inlineStyles: false },
  vite: { build: { cssCodeSplit: false } },
  ```

  `failOnError` turns a page that fails to render into a failed build, not a missing file. A page
  rendered on every request needs `nuxt build` and a server to run it; choose that only when
  prerendering cannot work (per-user pages that must be indexed).

## `nuxt.config.ts`

```ts
import { simplifyAliasesModule } from '@nzyme/nuxt-tools';
import { loadEnvVariables } from '@nzyme/project-utils/loadEnvVariables.js';
import { defineNuxtConfig } from 'nuxt/config';

import { cssOptions } from '{{scope}}/ui/viteShared.js';

/** The environment this build is for; the same `ENV` Nx keys its cache on (`localEnvironment`). */
const ENV = process.env.ENV ?? 'dev';

// `.env` and `.env.<ENV>` beside this file. Both are gitignored, so the package's `appEnvironment`
// runtime input (`package.json`) hashes them into the build's cache key.
loadEnvVariables({ cwd: import.meta.dirname, env: ENV, root: false });

export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',
    // Pinned: Nuxt 4 moves `srcDir` to `app/` as soon as that folder holds anything but `router.options.ts`.
    srcDir: '.',
    ssr: false,
    devtools: { enabled: true },
    modules: [simplifyAliasesModule()],
    // Nothing is auto-registered or auto-imported: every component and function is imported explicitly.
    components: false,
    imports: { autoImport: false, dirs: [] },
    typescript: { typeCheck: true, strict: true },
    runtimeConfig: {
        // Overridden at build time by `NUXT_PUBLIC_*` variables from the env files.
        public: { apiUrl: '/api' },
    },
    hooks: {
        // Routes are declared only in `app/router.options.ts`; a file Nuxt would route fails the build.
        'pages:resolved'(pages) {
            if (pages.length > 0) {
                const files = pages.map(page => page.file ?? page.path).join(', ');
                throw new Error(`Routes are declared in app/router.options.ts, not as files (${files})`);
            }
        },
    },
    logLevel: 'silent',
    vite: {
        clearScreen: false,
        logLevel: 'warn',
        css: cssOptions,
        define: {
            // A literal in the built code (`shims.d.ts`), so a production build drops what it guards.
            __ENV__: JSON.stringify(ENV),
        },
    },
});
```

`shims.d.ts`:

```ts
/** The build's environment (`ENV`), written into the code as a literal by `nuxt.config.ts`. */
declare const __ENV__: string;
```

- **Explicit imports only.** Components come from their file (`import Button from
  '{{scope}}/ui/Button.vue'`), Nuxt's API from `nuxt/app`, `NuxtPage`/`NuxtLayout` from
  `#components`. An auto-import is invisible to grep, to the code index and to an agent reading the
  file.
- **`simplifyAliasesModule()`** leaves `@/` (the package root) as the only alias:
  `node_modules/@nzyme/nuxt-tools/README.md`. `outputFilesModule` from the same package serves a
  runtime `env.json` when a deployed build must read config it was not built with.
- **`cssOptions`** comes from the UI package, so the app, Storybook and Vitest compile SCSS alike
  (`references/ui-package.md`). In a repo with no UI package it lives in the app.
- **`define`** for code that must not ship to production (a local sign-in, a debug panel): guard it
  with `__ENV__` and the bundler drops it. Add a constant per need; never read `process.env` in
  client code.
- **More than one app:** move the shared part of this config into a `getNuxtConfig(options)` factory
  in a workspace package, so every app's `nuxt.config.ts` is a few lines.

## Routes

```ts
import type { RouterConfig } from 'nuxt/schema';
import type { RouteRecordRaw } from 'vue-router';

// The only place routes are declared; `nuxt.config.ts` fails the build if `pages/` holds a file.
export default {
    routes: (): RouteRecordRaw[] => [
        {
            path: '/',
            name: 'home',
            component: () => import('@/home/HomePage.vue'),
        },
    ],
} satisfies RouterConfig;
```

Routes are data: one list, every page lazy-loaded, `meta` saying who may open a route
(`meta.auth`, enforced by one global middleware) and which layout it uses (`meta.layout`, read by
`<NuxtLayout :name>`). Path constants live in one module the app, the stories and the e2e specs all
import. A content site that genuinely wants file-based routes records that choice in
`ARCHITECTURE.md`.

## IoC

One plugin creates the container; every other plugin runs after it.

```ts
import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { CommonPlugin } from '@nzyme/vue/CommonPlugin.js';
import { createContainer } from '@nzyme/vue-ioc/createContainer.js';
import { IocPlugin } from '@nzyme/vue-ioc/IocPlugin.js';
import { defineNuxtPlugin } from 'nuxt/app';

/** Creates the app's IoC container and registers what every screen relies on. */
export default defineNuxtPlugin({
    name: 'ioc-plugin',
    setup(nuxtApp) {
        const container = createContainer();
        nuxtApp.vueApp.use(IocPlugin, { container });
        // Swallows `CancelError` in unhandled rejections and Vue's error handler.
        nuxtApp.vueApp.use(CommonPlugin);

        container.set(LanguageContext, () => 'en');
    },
});
```

```ts
import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { defineNuxtPlugin, useHead } from 'nuxt/app';

/** Sets `<html lang>` from the language the container provides. */
export default defineNuxtPlugin({
    name: 'language-plugin',
    dependsOn: ['ioc-plugin'],
    setup(nuxtApp) {
        const language = nuxtApp.vueApp.runWithContext(() => useService(LanguageContext));
        useHead({ htmlAttrs: { lang: language() } });
    },
});
```

- The `ioc-plugin` registers the interface implementations (`LanguageContext`, an auth store) and
  sets values from `useRuntimeConfig().public`. Services themselves resolve lazily on first
  `useService`; how to define them is `nzyme:ioc`.
- **`dependsOn: ['ioc-plugin']`** on every plugin that resolves a service, so the order is stated,
  not inherited from file names. Outside a component, resolve through
  `nuxtApp.vueApp.runWithContext(() => useService(X))`.
- The Storybook preview builds the same container for stories (`references/ui-package.md`); keep the
  two registering the same interfaces.

`app.vue` wraps the page in reka-ui's `ConfigProvider` and imports the global CSS once:

```vue
<script lang="ts" setup>
import { NuxtLayout, NuxtPage } from '#components';
import { ConfigProvider } from 'reka-ui';

import '{{scope}}/ui/styles/main.scss';
</script>

<template>
  <ConfigProvider
    locale="en"
    dir="ltr"
    :scroll-body="false"
  >
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </ConfigProvider>
</template>
```

## Env files and the build cache

The app's `.env` and `.env.<ENV>` change what `nuxt generate` writes (`runtimeConfig.public` is
baked into the output) and are gitignored, so Nx cannot see them. The app's `package.json` therefore
overrides `appEnvironment` with a `runtime` input that hashes both, paths spelled from the workspace
root — the rule and its reason are in `references/nx.md`. Add a row per file to the guard test's
`GITIGNORED_INPUTS`:

```ts
{ file: 'packages/{{app}}/.env', tasks: ['{{scope}}/{{app}}:build'] },
{ file: 'packages/{{app}}/.env.dev', tasks: ['{{scope}}/{{app}}:build'] },
```

A build that reads any other gitignored file (a key, a per-worktree config) adds it to the same
`cat` and gets its own row.

## Placeholders

- `{{scope}}` — the npm scope (`references/monorepo.md`).
- `{{app}}` — the package directory and name suffix, `app` unless the repo has several apps
  (`customer-app`, `admin`).
- `{{description}}` — one line: what the app is and for whom.
- `{{nzyme:<package>}}` — the version a package under `nzyme/packages/` pins for `<package>`, copied
  as written; where two pin it differently, the exact one. One version of `vue` across the workspace
  is not a preference: a second copy breaks every `provide`/`inject`, the IoC container included.
- `reka-ui` and `sass` are literal in the template, the versions the skeleton was tested with
  (2026-10-30); bump them deliberately.

## Compare

- `package.json`: key-wise. A missing `appEnvironment` override in an app with env files, or one with
  a `{projectRoot}` path, is always a difference — and so is a missing guard row. Repo scripts and
  dependencies stay.
- `nuxt.config.ts`: by option. Auto-imports on, `pages/` routing, a `~`/`@@` alias in use, `ssr`
  missing (Nuxt's default is SSR), or an SSR app without `inlineStyles: false` and
  `cssCodeSplit: false` while it uses `@nzyme/vue` containers: each a difference. Repo modules,
  `app.head`, route rules and hooks stay.
- Plugins: a container created anywhere but one `ioc-plugin`, or a plugin that resolves services
  without `dependsOn: ['ioc-plugin']`, is a difference.
- A repo-owned `app` skill holds the app's own paths, routes module and conventions
  (`references/repo-skills.md`); offer it when the app has none.
