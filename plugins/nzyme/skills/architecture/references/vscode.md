# VS Code

The editor runs the same tools as the scripts: oxfmt formats on save, oxlint and ESLint report as
you type, with the repo's own configs. Nothing in the editor config carries a rule of its own.

## Reference state

- **`.vscode/settings.json`** — `assets/vscode-settings.json.tmpl`:
  - the oxc extension as the default formatter, globally and per language (TypeScript, TSX,
    JavaScript, JSON, JSONC, Vue), and format on save. The per-language entries matter: a user's own
    `[typescript]` formatter beats a workspace-wide `editor.defaultFormatter`, but not a workspace
    per-language one. The built-in TypeScript, JavaScript and JSON formatters are off.
  - `*.xml` and `*.svg` associated with HTML, so oxfmt formats them.
  - ESLint validating `.vue` only (oxlint covers everything else), run through bun.
  - oxlint on type; bun as the package manager and test runner (`*.test.ts`).
  - Search excludes build output, `.nx`, `bun.lock` and `.context`; search follows symlinks, so
    `.claude/skills/nzyme` is searched.
- **`.vscode/extensions.json`** — `assets/vscode-extensions.json.tmpl`: `oxc.oxc-vscode` (oxlint and
  oxfmt), `dbaeumer.vscode-eslint`, `Vue.volar`, `oven.bun-vscode`.

The extensions discover nested configs, unlike the scripts: a file opened under `nzyme/` is linted
and formatted with nzyme's configs (`references/lint-format.md`).

## Placeholders

None.

## Compare

- `settings.json`: key-wise. The keys above are the reference's; everything else stays: colour
  themes (Peacock), snippets files, `launch.json`, debug and terminal settings, extra excludes.
- A different default formatter (Prettier, `vscode.typescript-language-features`) or
  `editor.formatOnSave: false`: a difference — the editor then writes code `format:check` rejects.
- `typescript.tsdk: node_modules/typescript/lib`: a difference unless the repo installs
  `typescript`. The reference installs only tsgo (`@typescript/native-preview`), so the path points
  at nothing; drop the key.
- `extensions.json`: missing recommendations are added; the repo's own stay. A recommended
  `esbenp.prettier-vscode` is a leftover: propose removing it.
