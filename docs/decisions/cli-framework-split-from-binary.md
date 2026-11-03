# CLI framework split from the `nzyme` binary

## Status

Accepted

## Context

`@nzyme/cli` held both the clipanion-based framework (`Command`, `execute`, `initialize`) used by
every product CLI and the `nzyme` binary with its commands. The binary's dependencies (remark,
typescript, depcheck and others) came with every package that only wanted to define a command.

The split was first needed to break a cycle: `@nzyme/secrets` defines commands, and the binary would
have depended on `@nzyme/secrets`. With plugins (`nzyme-cli-plugins.md`) the binary no longer depends
on `@nzyme/secrets`, so the cycle is gone. The dependency weight remains: a repo's plugin, and
`@nzyme/secrets` itself, would pull in the whole binary.

## Options Considered

- **No split.** Keeps the API, but every command package depends on the binary.
- **Split, with `@nzyme/cli` re-exporting the framework.** Not breaking, but two import paths for one
  API, and the re-exports keep the binary's consumers coupled to it.
- **Split, no re-exports.** Breaking: consumers change their imports.

The user chose the split without re-exports.

## Decision

`@nzyme/cli-core` holds `Command`, `CommandScope`, `execute`, `initialize`, the re-exported clipanion
`Option` and `UsageError`, and the `NzymePlugin` type. `@nzyme/cli` keeps only the binary and
`NzymePackageConfig`. Released as a breaking change (`feat(cli-core)!`).

## Consequences

- Consumers import the framework from `@nzyme/cli-core` (`@nzyme/cli/Command.js` becomes
  `@nzyme/cli-core/Command.js`, and so on).
- Packages that ship commands (`@nzyme/secrets`, product CLIs) depend on `@nzyme/cli-core` only.
- One copy of `@nzyme/cli-core` must be installed, so that plugin commands extend the binary's
  `Command`.
