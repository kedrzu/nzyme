# @nzyme/discord-cli

Agent-facing Discord commands over the official [Discord OpenAPI spec](https://github.com/discord/discord-api-spec),
authenticated as a bot. A thin configuration of [`@nzyme/openapi-cli`](../openapi-cli): `schema` browses the
committed spec offline, `get` sends a GET, `write` sends a POST, PUT, PATCH or DELETE. Requests go only to
`https://discord.com/api/v10`.

## Installation

```bash
bun add @nzyme/discord-cli @nzyme/cli-core
```

## Register in a CLI

```ts
import { defineDiscordCommands } from '@nzyme/discord-cli/defineDiscordCommands.js';

export const DiscordCommands = defineDiscordCommands({
    prefix: 'discord',
    botToken: () => process.env.DISCORD_BOT_TOKEN ?? '',
});
```

Register the returned command classes with the CLI. `botToken` is called only when a request is about to
be sent, so `schema` never needs it. Keep the token in a secret store, never in the repo.

## Create the bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create a **New
   Application**.
2. In **Bot**, reset and copy the token. This is the value `botToken` returns.
3. In **Bot**, under **Privileged Gateway Intents**, enable **Message Content Intent**. Without it the
   `content` of messages comes back empty.
4. In **OAuth2 > URL Generator**, select the `bot` scope and the permissions the agent needs, for example
   View Channels, Read Message History and Send Messages. Open the generated URL and add the bot to your
   server.

## Examples

```bash
discord schema                                   # list the tags
discord schema --tag channels                    # operations of one tag
discord schema create_message                    # one operation or schema
discord get /channels/<id>/messages --query limit=20
discord write POST /channels/<id>/messages --data '{"content":"hi"}'
```

## Refreshing the spec

`openapi.json` is the spec at the commit pinned in `scripts/fetchSchema.ts`. Bump that SHA and run
`bun run schema` in this package. The script sends no credential.
