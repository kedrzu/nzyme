# `nzyme` CLI plugins listed in `package.json`

## Status

Accepted

## Context

Most of the repos adopting `@nzyme/secrets` have no CLI of their own. They still need the `secrets`
commands, configured by the repo's own code (its `SecretsProvider`), not by static config read by
the binary.

> **Checked 2026-11-02:** with two copies of clipanion installed, options declared by a command from
> one copy are rejected by the other's parser with `Unsupported option name`: `isOptionSymbol` is a
> module-local `Symbol`, so the two copies do not recognise each other's options.

> **Checked 2026-11-02:** `bun pm pack` rewrites `workspace:*` to the exact version of the
> dependency. Published `@nzyme/*` packages therefore pin each other exactly, and mixing versions
> installs a second copy of `@nzyme/cli-core` (and of clipanion).

## Options Considered

- **List in `package.json` `nzyme.plugins`.** Reuses the `nzyme` field the binary already reads
  (`NzymePackageConfig`); no new file.
- **`nzyme.json`.** A new file for one list.
- **`nzyme.config.ts`.** Code-configurable, but the binary would have to load a config module on every
  run, built-ins included.

The user chose the `package.json` list.

## Decision

A repo lists plugin modules, as paths from the project root, under `nzyme.plugins` in its root
`package.json`. A module default-exports `{ commands }` (`NzymePlugin` from `@nzyme/cli-core`), and
the binary adds those commands to its own.

- A built-in command loads no plugin, so a broken plugin cannot affect it.
- With no command (no arguments, `--help`, `--version`), a broken plugin is a warning.
- Any other invocation exits with 1 on a broken plugin, naming its path and the cause.
- A command that does not extend the binary's `Command` is reported as a second copy of
  `@nzyme/cli-core`, with the fix: one version of `@nzyme/*`, installed in the repo.

## Consequences

- `@nzyme/cli` and every other `@nzyme/*` package must be one version, installed in the repo. A
  globally installed `nzyme` with a repo's plugin is unsupported.
- A plugin module is imported on every non-built-in invocation; it should only define commands, and
  do work only when they run.
- Plugins depend on `@nzyme/cli-core`, not on the binary (`cli-framework-split-from-binary.md`).
