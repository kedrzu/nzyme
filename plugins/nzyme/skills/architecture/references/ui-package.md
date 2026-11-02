# UI package

The package the product's components live in, with Storybook and the Vitest browser project that
runs every story as a test. This reference owns the setup only. How a component is built, which
stories and specs it needs, and what WCAG 2.2 AA asks of it are `../ui/SKILL.md`; how a spec is
written is `nzyme:testing`.

## Reference state

```
packages/ui/
├── package.json        # assets/ui-package.json.tmpl
├── tsconfig.esm.json   # hand-written; nzyme monorepo generates tsconfig.json from it
├── viteShared.ts       # cssOptions, shared by Nuxt, Storybook and Vitest
├── vitest.config.ts
├── .storybook/
│   ├── main.ts
│   └── preview.ts
└── src/
    ├── shims.d.ts      # the test-id attribute in TSX
    ├── styles/
    │   ├── tokens.scss # variables and mixins only, injected everywhere
    │   └── main.scss   # global CSS, imported once by the app and the preview
    └── Button.vue, Button.stories.tsx, Button.spec.ts, Button.loc.yaml, …
```

- **`package.json`** — `assets/ui-package.json.tmpl`. No build: the package exports its sources
  (`./*.vue`, `./*.js` → `./src/*.ts`, `./*.jsx` → `./src/*.tsx`, `./*.scss`), and the app's
  bundler compiles them. `@nzyme/i18n-core` is a dependency because every generated `.loc.ts`
  imports it; without it the first `.loc.yaml` breaks the typecheck.
- **Versions:** `vitest` and both `@vitest/browser*` packages are one version; the four Storybook
  packages are one version; `playwright` and `@playwright/test` are one version, and it is the one
  `setup.build.sh` installs a browser for (`references/setup-scripts.md`).
- **Root wiring:**
  - root `package.json` scripts `"test:stories": "nx run-many -t test:stories"` and
    `"storybook": "bun --cwd packages/ui storybook"`; the cached `test:stories` target default is
    already in `nx.json` (`references/nx.md`);
  - `setup.build.sh` keeps its `{{if browser-tests}}` block;
  - the package gets a `files` entry in the `.oxlintrc.json` `.vue` override
    (`references/lint-format.md`);
  - the root `tests` script already skips `*.spec.ts`, so bun never runs a browser spec.

## TypeScript

`tsconfig.esm.json`:

```json
{
    // Type-checked by vue-tsc (`typecheck`), not by `tsgo --build`: `noEmit` keeps the package out of
    // the root build, and `nzyme monorepo` writes `tsconfig.json` with its references from this file.
    "extends": "@vue/tsconfig/tsconfig.dom.json",
    "compilerOptions": {
        "noEmit": true,
        "lib": ["ESNext", "DOM", "DOM.Iterable"],
        "types": ["vite/client", "node"]
    },
    "include": ["./src/**/*", "./.storybook/**/*", "./viteShared.ts", "./vitest.config.ts"]
}
```

- `@vue/tsconfig` gives Vue's JSX (`jsxImportSource: vue`), which the `.tsx` stories need; nzyme's
  own `@nzyme/tsconfig/vue.json` uses an `h` factory instead and would demand `h` in scope in every
  story.
- `tsgo` cannot read `.vue` files, so `vue-tsc --noEmit` is the package's `typecheck` and the root
  `typecheck` reaches it through `nx run-many -t typecheck`.
- `.loc.yaml` files beside components compile to `.loc.ts` through the root `localise` script (run by
  `setup.build.sh` and watched by `watch:localise`); authoring them is `nzyme:translations`.

`src/shims.d.ts`, so a story can put the test id on any element in TSX:

```ts
// The test-id attribute (`tid`, `locators.testIdAttribute` in `vitest.config.ts`) on any element in
// TSX, so stories can mark what a spec finds with `getByTestId`.
import 'vue';

declare module 'vue' {
    interface HTMLAttributes {
        /** Test id, found by `getByTestId` in component specs and e2e harnesses. */
        tid?: string;
    }
}
```

## Shared Vite options

The token partial is injected into every SCSS block of the repo's own packages through Vite's
`additionalData`. The options live in one module that the Nuxt config, Storybook and (through
Storybook) Vitest all import, so a component compiles the same way in each.

`viteShared.ts`:

```ts
import { fileURLToPath } from 'node:url';

import type { CSSOptions } from 'vite';

// Vite options every build of the repo's components shares — the Nuxt app (`nuxt.config.ts`),
// Storybook (`.storybook/main.ts`) and through it Vitest — so a component compiles the same way in all
// three.

// The repo's own packages; SCSS from anywhere else (nzyme, node_modules) is compiled as is.
const packagesPath = fileURLToPath(new URL('..', import.meta.url));
const tokensPath = fileURLToPath(new URL('./src/styles/tokens.scss', import.meta.url));

export const cssOptions: CSSOptions = {
    devSourcemap: true,
    preprocessorOptions: {
        scss: {
            // The token partial is in scope in every SCSS block of the repo's packages.
            additionalData: (source: string, filename: string) => {
                if (filename.startsWith(packagesPath) && !filename.includes('/node_modules/')) {
                    return `@use '${tokensPath}' as *;\n${source}`;
                }

                return source;
            },
        },
    },
};
```

The path filter matters: injected into nzyme's or a library's SCSS, the tokens would collide with
their own variables. What goes in `tokens.scss` and `main.scss` (role names, no emitted CSS, contrast
noted on the token) is `../ui/references/styling.md`; a new package starts with a comment saying the
partial emits nothing and a handful of tokens.

## Storybook

`.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/vue3-vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { mergeConfig } from 'vite';

import { cssOptions } from '../viteShared.js';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    addons: ['@storybook/addon-a11y', '@storybook/addon-docs', '@storybook/addon-vitest'],
    framework: {
        name: '@storybook/vue3-vite',
        options: { docgen: false },
    },
    // Storybook builds components without Nuxt, so this repeats what Nuxt's Vite setup gives them. The
    // Vitest plugin (`vitest.config.ts`) takes its Vite config from here too.
    viteFinal: viteConfig =>
        mergeConfig(viteConfig, {
            plugins: [vue(), vueJsx()],
            css: cssOptions,
        }),
};

export default config;
```

`.storybook/preview.ts`:

```ts
import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { CommonPlugin } from '@nzyme/vue/CommonPlugin.js';
import { createContainer } from '@nzyme/vue-ioc/createContainer.js';
import { IocPlugin } from '@nzyme/vue-ioc/IocPlugin.js';
import type { Preview } from '@storybook/vue3-vite';
import { setup } from '@storybook/vue3-vite';
import { ConfigProvider } from 'reka-ui';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import '../src/styles/main.scss';

// What the app's `ioc-plugin` gives a component, so a story renders it as the app does.
setup(app => {
    const container = createContainer();
    container.set(LanguageContext, () => 'en');
    app.use(IocPlugin, { container });
    app.use(CommonPlugin);
    // Links need a router; any path renders nothing and stays inside the story.
    app.use(
        createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/:path(.*)*', component: defineComponent({ render: () => null }) }],
        }),
    );
});

const preview: Preview = {
    parameters: {
        a11y: {
            // A violation fails the story's test. `wcag22aa` is what turns axe's target-size rule on.
            test: 'error',
            options: {
                runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
            },
        },
    },
    decorators: [
        story => {
            const Story = story();
            return defineComponent({
                // As in `app.vue`: every component sits inside reka-ui's `ConfigProvider`.
                setup: () => () =>
                    h(ConfigProvider, { locale: 'en', dir: 'ltr', scrollBody: false }, { default: () => h(Story) }),
            });
        },
    ],
};

export default preview;
```

- **`a11y.test: 'error'` with the WCAG 2.2 AA tags** is the enforcement `../ui/SKILL.md` relies on.
  Without `wcag22aa` axe never runs target-size (2.5.8): proven on the skeleton, a story with two
  10 px buttons passes without the tag and fails with it.
- The preview registers what the app's `ioc-plugin` registers (`references/nuxt-app.md`); a language
  toolbar (a `globalTypes.language` read by the `LanguageContext`) and the app's viewports are the
  usual next additions.

## Vitest browser mode

`vitest.config.ts`:

```ts
import path from 'node:path';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Adds the component specs (`*.spec.ts`, which drive stories through `composeStories`) to the
 * storybook project. `storybookTest` replaces `test.include` with the story globs, so a plugin listed
 * after it appends them. Never `STORYBOOK_COMPONENT_PATHS` instead: it switches on Storybook's "ghost
 * stories" mode, in which addon-a11y skips axe for every story.
 */
const componentSpecs: Plugin = {
    name: 'component-specs',
    config: () => ({ test: { include: ['src/**/*.spec.ts'] } }),
};

export default defineConfig({
    test: {
        projects: [
            {
                extends: true,
                // The Vue plugins and SCSS tokens come from `.storybook/main.ts`, which `storybookTest`
                // applies; adding them here would compile every component twice.
                plugins: [storybookTest({ configDir: path.join(import.meta.dirname, '.storybook') }), componentSpecs],
                test: {
                    name: 'storybook',
                    browser: {
                        enabled: true,
                        provider: playwright({}),
                        headless: true,
                        instances: [{ browser: 'chromium' }],
                        locators: { testIdAttribute: 'tid' },
                    },
                },
            },
        ],
    },
});
```

`bun run test:stories` then renders every story in Chromium, fails on a render error or an axe
violation, and runs the `*.spec.ts` files beside them.

## A repo with one app and no UI package

The same files go into the app package: `viteShared.ts` and `src/styles/` at the app root,
`.storybook/` and `vitest.config.ts` beside `nuxt.config.ts`, the stories glob widened to
`'../**/*.stories.@(ts|tsx)'`, and an `@` alias to the app root in `viteFinal`, since Storybook does
not run Nuxt. Propose the UI package once a second app or a landing site needs the same components.

## Placeholders

- `{{scope}}` — the npm scope (`references/monorepo.md`).
- `{{nzyme:<package>}}` — as in `references/nuxt-app.md`: the version `nzyme/packages/*/package.json`
  pins, the exact one where two differ.
- Storybook, `@playwright/test`/`playwright`, `reka-ui`, `sass` and `@vue/tsconfig` are literal in
  the template: the versions the skeleton was tested with (2026-10-30). Bump each group together.

## Compare

- `package.json`: key-wise; repo dependencies and scripts stay. A `test:stories` script missing, or a
  `vitest`/`@vitest/browser*` version split, is a difference.
- `preview.ts`: `a11y.test` other than `'error'`, or `runOnly` without `wcag22aa`, is always a
  difference, shown even when the rest matches. Repo decorators, globals and viewports stay.
- `vitest.config.ts`: no browser project, a provider other than Playwright, `STORYBOOK_COMPONENT_PATHS`
  in a script, or specs that never run (`test.include` set beside `storybookTest`, which drops it) —
  each a difference.
- Token injection that is not shared (an `additionalData` copied into the Nuxt config and Storybook
  separately), or one without the path filter: a difference.
- Jest, `@vue/test-utils` mounts in jsdom, or Storybook's test runner instead of the Vitest project:
  propose this setup; the component specs move to `composeStories` (`nzyme:testing`).
