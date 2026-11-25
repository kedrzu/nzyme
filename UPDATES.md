# Updates

Versions the package manager does not track — container images, tools, runtimes, binaries pinned in
config files or CI. The weekly package update walks every entry: runs **Latest**, compares it with
the pin, and if newer follows **Bump**, **Rollout** and **Verify**; a red result is reverted and
recorded in `docs/package_update.md` → Known Issues. One `###` per item, all five fields filled;
**Latest** is a command that prints exactly one version. The package manager's own dependencies do
not belong here.

### bun

- **Pinned in**: `package.json` — `packageManager`. CI reads it through `bun-version-file:
  package.json` (`.github/workflows/ci.yml`, `release.yml`).
- **Latest**: `gh api repos/oven-sh/bun/releases/latest --jq '.tag_name | ltrimstr("bun-v")'`
- **Bump**: together with `@types/bun` and `bun-types`, as `docs/package_update.md` →
  "`@types/bun` / `bun-types` / `packageManager` — one version, three places" says; install that
  bun locally first (`curl -fsSL https://bun.sh/install | bash -s "bun-v<version>"`).
- **Rollout**: nothing to deploy; CI picks the pin up on its next run. A consuming project moves its
  own pin in the same run.
- **Verify**: `bun --version` prints the pin, then the full `verify` protocol.

### Node in the `logging-ui` image

- **Pinned in**: `packages/logging-ui/Dockerfile` — `FROM node:<major>-alpine`
- **Latest**: `curl -fsSL https://nodejs.org/dist/index.json | jq -r '[.[] | select(.lts)][0].version | ltrimstr("v") | split(".")[0]'`
  — the newest LTS major; the tag floats within the major, so only a major is ever bumped.
- **Bump**: edit the major in the `FROM` line.
- **Rollout**: a consumer that builds the image (its local Docker Compose) rebuilds it on its next
  `up --build`; nothing is deployed.
- **Verify**: `bun nx run @nzyme/logging-ui:build`, then
  `docker build -t logging-ui-check packages/logging-ui` and
  `docker run --rm -d -p 3012:3012 logging-ui-check` answers on `http://127.0.0.1:3012`.

### Node in the release workflow

- **Pinned in**: `.github/workflows/release.yml` — `actions/setup-node`, `node-version`
- **Latest**: `curl -fsSL https://nodejs.org/dist/index.json | jq -r '[.[] | select(.lts)][0].version | ltrimstr("v") | split(".")[0]'`
- **Bump**: edit `node-version`.
- **Rollout**: takes effect on the next release run.
- **Verify**: the workflow's Node steps run on the next release; locally, `node --version` on that
  major runs the same commands.

### GitHub Actions

- **Pinned in**: `.github/workflows/*.yml` — every `uses: <owner>/<action>@v<major>`: `actions/checkout`,
  `actions/setup-node`, `oven-sh/setup-bun`, `amannn/action-semantic-pull-request`
- **Latest**: per action, `gh api repos/<owner>/<action>/releases/latest --jq '.tag_name | split(".")[0]'`
  — one line per action in the report.
- **Bump**: edit the major in every `uses:` of that action; read the action's release notes for
  renamed or removed inputs first.
- **Rollout**: takes effect on the PR that carries the bump — its own CI runs on the new major.
- **Verify**: the PR's checks are green; `release.yml` is proven on the next release.
