# @nzyme/openapi-cli

Agent-facing CLI commands over an OpenAPI REST service, defined by configuration only: `schema` browses
the committed OpenAPI document offline, `get` sends a GET, `write` sends a POST, PUT, PATCH or DELETE.
`get` and `write` are separate commands so a permission rule can allow reads and hold writes for
confirmation.

## Installation

```bash
bun add @nzyme/openapi-cli @nzyme/cli-core
```

## Usage

```ts
import { defineOpenApiCommands } from '@nzyme/openapi-cli/defineOpenApiCommands.js';

export const DiscordCommands = defineOpenApiCommands({
    prefix: 'discord',
    service: 'Discord',
    baseUrl: 'https://discord.com/api/v10',
    specPath: fileURLToPath(new URL('../openapi.json', import.meta.url)),
    authScheme: 'Bot',
    credential: () => readBotToken(),
    headers: { 'User-Agent': 'DiscordBot (https://example.com, 1)' },
    securityScheme: 'BotToken',
});
```

Register the returned command classes with the CLI. They give:

- `discord schema` lists the tags (an untagged operation is grouped by its first path segment);
  `--search` and `--tag` list operations as `operationId METHOD /path — summary`; a name shows one
  operation or component schema compactly.
- `discord get <path> --query k=v…` prints the response body as one line of JSON on stdout.
- `discord write <METHOD> <path> --data <json|-> --query k=v…` does the same for a write; `--data -`
  reads the body from stdin.

## Guarantees

- `credential` receives `{ container }`, the running command's scoped container, to resolve a `CommandScope` service; a callback that ignores it works too.
- The credential is resolved only right before a request: never by `schema` or by a usage error.
- It is scrubbed (`[redacted]`) from everything written, including echoed bodies and network errors.
- Redirects are refused; a request times out after 30 s.
- A failure exits 1 with `<service> <METHOD> <path> failed: <status>` as the first stderr line and the
  body indented below; nothing goes to stdout. Usage errors exit 2.
