# Agent CLIs over OpenAPI REST services share one core

## Status

Accepted

## Context

Agents reach external services through thin CLIs rather than MCP servers. An MCP server costs
context in every session and needs an OAuth sign-in per worktree. A CLI costs nothing until it is
called, and on Linear it measured about half the tokens per task. Linear has a GraphQL API, so its CLI is
`linear query` + `linear schema` (`@nzyme/linear`).

For a REST service with an OpenAPI document, the CLI has three commands:

- `schema` browses the committed spec offline.
- `get` can only read, so a permission rule can allow it.
- `write` sends POST, PUT, PATCH or DELETE, so a rule can hold every write for confirmation.

A product repo built this trio first for Drata. Discord needed the same trio. Only the base URL, the
auth header, the spec and a few headers differ.

> **Checked 2026-11-17:** Discord's official spec (`discord/discord-api-spec`, MIT, OpenAPI 3.1) has
> 250 operations with no tags and no summaries. Nullables are `type: [x, "null"]`, and path
> parameters are declared on the path item for 136 of 157 paths. Drata's spec (OpenAPI 3.0, 312
> operations) has tags and summaries and uses `nullable: true`. Drata's renderer handled none of
> Discord's forms.

> **Checked 2026-11-17:** Discord requires `User-Agent: DiscordBot ($url, $versionNumber)` and may
> block requests without it ([API reference](https://discord.com/developers/docs/reference), HTTP API →
> User Agent).

## Options Considered

- **A copy per service:** `@nzyme/discord-cli` would be shaped like the Drata package. Trade-off:
  ~500 lines duplicated per service. Each fix to the credential scrubbing, redirect refusal or
  rendering lands in one copy only.
- **One core, services as configuration:** `@nzyme/openapi-cli` would expose
  `defineOpenApiCommands({ prefix, service, baseUrl, specPath, authScheme, credential, headers,
  securityScheme })`. Trade-off: the core must cover the variants of both specs: groups by tag or
  by first path segment, both nullable forms, path-item parameters, and an `auth:` line for operations the
  configured scheme cannot call.

## Decision

One core. `@nzyme/discord-cli` is configuration plus the committed spec, and Drata migrates onto
the core in its product repo. The command names, options and output for Drata's spec stay the
same. The one exception is the operation view, which gains the description line.

## Consequences

- A security property is written and tested once for every service. This covers the credential
  that never reaches stdout or stderr, the refused redirects and the 30 s timeout.
- A new service is a `define<Service>Commands` of a few lines, a committed spec and a fetch script.
- Both packages are public, so changing the core's options or output is a breaking change for every
  service CLI built on it.
