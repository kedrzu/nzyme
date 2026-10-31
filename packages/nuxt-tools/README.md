# @nzyme/nuxt-tools

Nuxt modules used by nzyme-based Nuxt apps.

```bash
bun add -D @nzyme/nuxt-tools
```

## `simplifyAliasesModule()`

Removes Nuxt's `@@`, `~`, `~~`, `assets` and `public` aliases, leaving `@/` as the only path alias
(assets are then reached as `@/assets/…`; public files as `@/public/…` only when `srcDir` is the
root, `srcDir: '.'`, since Nuxt 4's default `app/` srcDir leaves `public/` outside `@`).

## `outputFilesModule(files)`

Publishes generated files at the site root. `files` maps a file name to its content — a string, or a
function returning a string or a promise of one. In development each file is served by a Vite
middleware at `/<name>` (content type from the extension); on build it is written to
`.output/public/<name>`. Typical use: a runtime `env.json` read by the client at startup.

```ts
import { outputFilesModule, simplifyAliasesModule } from '@nzyme/nuxt-tools';

export default defineNuxtConfig({
    modules: [
        simplifyAliasesModule(),
        outputFilesModule({
            'env.json': () => JSON.stringify({ apiUrl: process.env.API_URL }),
        }),
    ],
});
```

The content function runs on every dev request and once per build.

## License

MIT
