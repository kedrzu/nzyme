# nzyme

A TypeScript framework of small `@nzyme/*` packages: dependency injection, logging, validation, i18n,
RPC, Vue integration (forms, composables, transitions) and tooling (CLI, oxlint rules, tsconfig, Pulumi
and Rollup helpers). Built and tested on Bun.

## Install

```sh
bun add @nzyme/utils @nzyme/ioc
```

All public packages share one version and are released together. `vue`, `vue-forms`, `vue-i18n` and
`vue-transitions` ship TypeScript/Vue sources and expect a bundler that compiles them (Vite, Nuxt);
the rest ship compiled ESM with type declarations.

To use nzyme as a git submodule inside a product monorepo, pinned to commits that passed the product's
CI, see [docs/consumers.md](docs/consumers.md).

## Develop

```sh
zsh setup.sh          # install, build the nzyme CLI, generate tsconfigs/translations, build packages
bun run test          # all tests
bun run lint:check    # oxlint + ESLint (Vue)
bun run format:check  # oxfmt + markdown
```

Paseo worktrees run `setup.sh` automatically (`paseo.json`).

For coding agents, [AGENTS.md](AGENTS.md) holds the rules, and `.claude/settings.json` enables the
`kedrzu-skills` plugins. Install them once per machine:

```sh
claude plugin marketplace add kedrzu/skills
claude plugin install dev@kedrzu-skills  # likewise design-doc, git, web-search, playwright, skill-improve
```

## Release

1. Pull requests go to `main`. Their titles must be [Conventional Commits](https://www.conventionalcommits.org),
   because they become the squash commit and drive the version and the changelog.
2. **Promote main to release** (a manual workflow) merges `main` into `release`. Hotfixes are pull
   requests straight to `release`.
3. Every push to `release` updates the release PR `chore(release): vX` with the next version and its
   [CHANGELOG](CHANGELOG.md) entry. Merging it publishes to npm (trusted publishing, with provenance),
   tags `vX` and creates the GitHub Release. `release` is then merged back into `main`.

The reasoning is in [docs/decisions/release-line-on-nx-release.md](docs/decisions/release-line-on-nx-release.md).

## Agent plugin for consumers

This repository is also a Claude Code marketplace. Its `nzyme` plugin teaches coding agents how to use
the packages (IoC, logging, translations, forms, composables, testing) and the conventions they follow:

```sh
claude plugin marketplace add kedrzu/nzyme
claude plugin install nzyme@nzyme
```

## License

MIT
