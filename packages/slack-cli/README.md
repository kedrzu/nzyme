# @nzyme/slack-cli

Slack commands for agents, acting as the developer through their own user token: read and search
conversations, look up channels and people, and send, edit and wait for replies as a marked agent. An
agent calls a CLI command, so no tool schema sits in its context in every session. Every message the
agent writes carries an agent marker naming the developer; `@channel`, `@here` and `@everyone` are
refused.

Why the package is built this way: `docs/decisions/slack-cli-with-auth-defined-once.md`.

## Installation

```bash
bun add @nzyme/slack-cli @nzyme/cli-core @nzyme/secrets
```

## Register

Define the auth once, in the product, and spread the commands into the product CLI's `execute` (its
`packages/cli`, `docs/decisions/product-clis-over-nzyme-plugins.md`):

```ts
// packages/secrets/src/SlackAuth.ts
import { defineSlackAuth } from '@nzyme/slack-cli/defineSlackAuth.js';

import { PersonalStore } from './PersonalStore.js';
import { SLACK_SESSION } from './secrets.js';

export const SlackAuth = defineSlackAuth({
    store: PersonalStore,
    token: SLACK_SESSION,
    clientId: '1234567890.1234567890',
    userScopes: ['channels:history', 'channels:read', 'chat:write', 'search:read', 'users:read'],
    redirectUri: 'http://localhost:8760/callback',
    signInCommand: 'acme slack auth',
});
```

```ts
// packages/cli/src/cli.ts
import { execute } from '@nzyme/cli-core/execute.js';
import { defineSlackCommands } from '@nzyme/slack-cli/defineSlackCommands.js';

import { SlackAuth } from '@acme/secrets/SlackAuth.js';

await execute({
    name: 'acme',
    commands: [
        // ...the product's other commands
        ...defineSlackCommands({
            auth: SlackAuth,
            taskLink: async () => ({ id: 'ACME-12', url: 'https://linear.app/acme/issue/ACME-12' }),
        }),
    ],
});
```

Any other code that needs the developer's token resolves the same `SlackAuth` and calls `get()`: it
refreshes the token when it nears expiry and stores the new grant, so commands and other code never spend
one refresh token twice.

`store` is the project's service resolving to the `SecretStore` (`@nzyme/secrets`) the sign-in lives in,
for example `defineService<SecretStore>({ name: 'PersonalStore', setup: () => keychainStore({ scope: 'acme' }) })`.

**The store's service must not be `CommandScope`-scoped.** The auth service is unscoped, so code outside a
command can resolve it from the root container; a dependency it resolves cannot live in a narrower scope.

## Options

`defineSlackAuth`:

|Option|Meaning|
|-|-|
|`store`|The project's service resolving to the `SecretStore` the sign-in is read from and written to|
|`token`|The secret (`defineSecret`) holding the sign-in|
|`clientId`|The Slack app's client id; public, as the app uses PKCE|
|`userScopes`|The user scopes the sign-in asks for: those the Slack app declares for user tokens|
|`redirectUri`|The redirect URI registered on the Slack app, `http://localhost:<port><path>`; `auth` refuses one that is not loopback HTTP with a port before it opens the browser|
|`signInCommand`|The command named in every "sign in again" message|

`defineSlackCommands`:

|Option|Default|Meaning|
|-|-|-|
|`auth`|required|The unit `defineSlackAuth` returned|
|`prefix`|`slack`|The command path prefix, space-separated|
|`taskLink`|none|Resolves the task the work belongs to (`{ id, url }`), or `undefined`; the footer of a thread's opening message links it|

## The Slack app

- **PKCE enabled**, with no client secret anywhere: the per-run verifier proves the code exchange. Slack
  rotates a PKCE app's user tokens: the access token lives 12 hours, and a refresh token issues the next
  pair.
- **User scopes only**, the same list as `userScopes`. Slack refuses bot scopes on a `localhost` redirect.
- **The redirect URI registered**, `http://localhost:<port><path>`. Slack accepts plain HTTP only on
  `localhost` for a PKCE app; the sign-in listens on that port, on loopback only.

## Token storage

The token secret holds one JSON object: `{ "accessToken": "…", "refreshToken": "…", "expiresAt": 1767225600000 }`,
`expiresAt` in milliseconds since the epoch. It acts as the developer, so `store` is a per-developer
store (the keychain), never a shared team store. A store that caches its reads implements `refresh`:
the auth calls it before refreshing an expiring token, to take a grant another process stored meanwhile.
If the port of the redirect URI is taken, `auth` says so before it opens the browser.

**The user runs `slack auth`, not the agent.** It opens a browser.

## Commands

|Command|Does|
|-|-|
|`slack auth`|Sign in to Slack and store the grant|
|`slack whoami`|Print the identity and workspace the token authenticates as|
|`slack read <target>`|Read a channel's recent history, or a whole thread from a permalink; `--limit`|
|`slack search <query>`|Search messages across the channels and DMs the token can see; `--limit`|
|`slack channels [query]`|Search channels by name, purpose and topic; `--limit`|
|`slack people [query]`|Search people by name, handle, email and title; `--limit`|
|`slack send [target]`|Post a Markdown body from stdin to a person, a channel, or `--thread <permalink>`; `--wait`, `--poll`, `--timeout`|
|`slack edit <permalink>`|Rewrite a message the agent posted, body from stdin|
|`slack wait <permalink>`|Block until the thread gets a reply; `--after`, `--poll`, `--timeout`|

`edit` refuses any message the agent did not post through the API: the token is the developer's, so
without the check the agent could rewrite what the developer typed.

## Exit codes

|Code|Meaning|
|-|-|
|0|Done, including a result with no matches|
|1|Not the caller's fault: no sign-in, a revoked or expired token, Slack unreachable|
|2|A wait's deadline passed with no reply, or the sign-in got no answer within 5 minutes|
|3|Fix the arguments: a target not found or ambiguous, a broadcast mention, an empty body, or a request Slack rejected as the caller's mistake (not joined, archived, unknown id, a message it will not edit)|
