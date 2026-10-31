# e2e

A Playwright package that drives the built app in Chromium. This reference owns the package, its
config and where harnesses live; how a spec and a harness are written — harness shape, selectors,
parallel-safe data, journeys — is `nzyme:testing` (its `references/e2e.md`), and which behaviour
belongs in e2e rather than a component spec is its `references/e2e-vs-component.md`.

## Reference state

```
packages/e2e/
├── package.json
├── tsconfig.esm.json
├── playwright.config.ts
└── src/
    ├── serveApp.ts            # serves the static build
    ├── harnesses/             # screen harnesses: one class per screen or app-level region
    └── <feature>/<flow>.spec.ts
```

Component harnesses live beside their component in the UI package (`Button.harness.ts` next to
`Button.vue`, `../ui/SKILL.md`) and are imported from there:
`import { ButtonHarness } from '{{scope}}/ui/Button.harness.js'`. A harness that models a whole screen
belongs to no component and lives in `src/harnesses/`. The UI package then lists `@playwright/test`
(already in `assets/ui-package.json.tmpl`) for the `Locator` type.

`package.json`:

```json
{
    "name": "{{scope}}/e2e",
    "private": true,
    "description": "Playwright end-to-end tests of the built app",
    "type": "module",
    "scripts": {
        "typecheck": "tsgo -p tsconfig.json",
        "test": "playwright test",
        "report": "playwright show-report"
    },
    "dependencies": {
        "{{scope}}/ui": "workspace:*",
        "@playwright/test": "{{version:@playwright/test}}"
    },
    "devDependencies": {
        "@nzyme/tsconfig": "workspace:*"
    }
}
```

`tsconfig.esm.json` — not emitted, since Playwright runs the specs from source; the package's own
`typecheck` checks them, reached by the root `typecheck` through Nx.

```json
{
    "extends": "@nzyme/tsconfig/esm.json",
    "compilerOptions": {
        "noEmit": true,
        "composite": false,
        "incremental": false,
        // Playwright runs specs in Node; `dom` types the code they evaluate in the page.
        "lib": ["esnext", "dom", "dom.iterable"],
        "types": ["node", "bun"]
    },
    "include": ["src", "playwright.config.ts"]
}
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// The built app, served as it is deployed. Every test creates its own data, so tests run in parallel.
export default defineConfig({
    testDir: './src',
    testMatch: /\.spec\.ts$/,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // A flaky test is a red to fix, not to retry away.
    retries: 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${PORT}`,
        // The same test-id attribute the component tests use (`vitest.config.ts`).
        testIdAttribute: 'tid',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        // Always this worktree's build, through Nx (a cache hit is safe: `references/nx.md`). A reused
        // server may be another worktree's, or a stale build.
        command: `bun nx run {{scope}}/{{app}}:build && PORT=${PORT} bun src/serveApp.ts`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
```

`src/serveApp.ts`:

```ts
import path from 'node:path';

// Serves the app's static build (`nuxt generate`) the way a static host does: a file when one
// exists, else the SPA's `200.html`, so a deep link opens the app at that route.
const root = path.resolve(import.meta.dirname, '../../{{app}}/.output/public');

Bun.serve({
    port: Number(process.env.PORT),
    async fetch(request) {
        const file = Bun.file(path.join(root, new URL(request.url).pathname));
        if (await file.exists()) {
            return new Response(file);
        }

        return new Response(Bun.file(path.join(root, '200.html')), { headers: { 'content-type': 'text/html' } });
    },
});
```

- **The built app, not `nuxt dev`:** e2e proves what ships. `nuxt preview` is not used for a static
  build: it fetches `serve` through `npx` at run time.
- **The backend** is whatever the repo has. Its local server is another `webServer` entry (Playwright
  starts them in order); a step that checks the stack is the local one, not a deployed one, goes in a
  `globalSetup`.
- **Mobile-first app:** replace `devices['Desktop Chrome']` with the phone the app is designed for
  (viewport, `isMobile`, `hasTouch`), and set `locale`/`timezoneId` to the users'.
- **`reducedMotion: 'reduce'`** in `use` when screen transitions leave the old screen in the DOM for a
  moment; one spec that tests the transitions opts back in.
- **Fixed port:** two worktrees running e2e at once collide on it. Derive it from the worktree (a hash
  of the path into a port range) once that happens.
- **Whole-page accessibility:** component stories already run axe; a flow that assembles a screen can
  add `@axe-core/playwright` with the same `wcag22aa` tag list as the Storybook preview.

## Root wiring

- Root script `"e2e": "bun --cwd packages/e2e test"`.
- `setup.build.sh` keeps its `{{if browser-tests}}` block (`references/setup-scripts.md`); the
  browser comes from the repo's `playwright` package.
- The root `tests` script skips `*.spec.ts`, so bun never picks up a Playwright spec;
  `test-results/` and `playwright-report/` are in `assets/gitignore.tmpl`.
- e2e is not part of the default verification: it needs the built app and the backend running. The
  repo's `verify` skill says when it runs.

## Placeholders

- `{{scope}}`, `{{app}}` — as in `references/nuxt-app.md`.
- `{{version:@playwright/test}}` — the version `@playwright/test` has in the UI package's
  `package.json`; the two must match, or a harness typed against one runs in the other.

## Compare

- `playwright.config.ts`: by option. `reuseExistingServer: true`, a `webServer` that runs `nuxt dev`,
  retries above 0, `fullyParallel` off, or a test-id attribute other than the component tests' — each
  a difference. Repo projects, `globalSetup` and extra servers stay.
- Harnesses: component harnesses kept in the e2e package while their components are in the UI package
  are a difference (they drift from the markup they wrap); screen harnesses stay in e2e.
- No e2e package and the request did not ask for one: nothing to propose. e2e is an element the repo
  opts into.
