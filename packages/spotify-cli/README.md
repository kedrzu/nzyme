# @nzyme/spotify-cli

Spotify for agents and programs: a typed Web API client, PKCE sign-in with the token in a secret store, and
curated commands for an agent. An agent calls a CLI command, so no tool schema sits in its context in every
session.

Nothing is ever removed from the account. No command sends a `DELETE` or `PUT`, and the library-modify scope
is not even requested, so a leaked token cannot unsave or unfollow anything either.

## Create your Spotify app in 2 minutes

1. Open [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and choose **Create app**.
2. Set the Redirect URI to exactly `http://127.0.0.1:8888/callback`. Spotify rejects `localhost`.
3. Tick **Web API** and save.
4. Copy the **Client ID**. No client secret is needed: sign-in uses PKCE.
5. Under **Settings → User Management**, add the email of your own Spotify account. A Development Mode app
   allows 5 users.

Since 2026-03-09, Development Mode requires the app owner to have Spotify Premium.

## Wiring in a product

Declare two secrets, next to the product's others:

- `SPOTIFY_CLIENT_ID`: the Client ID.
- `SPOTIFY_TOKEN`: written by `<cli> spotify auth`. Route it to a per-developer store (the keychain), never a
  shared one: it is the signed-in person's account.

```ts
// packages/secrets/src/secrets.ts
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

export const SPOTIFY_CLIENT_ID = defineSecret('SPOTIFY_CLIENT_ID');
export const SPOTIFY_TOKEN = defineSecret('SPOTIFY_TOKEN', { meta: { store: 'personal' } });
```

Register the commands in the product CLI:

```ts
import { execute } from '@nzyme/cli-core/execute.js';
import { defineSecretsCommands } from '@nzyme/secrets/commands/defineSecretsCommands.js';
import { defineSpotifyCommands } from '@nzyme/spotify-cli/defineSpotifyCommands.js';

await execute({
    name: 'acme',
    commands: [
        ...defineSecretsCommands({ provider: AppSecrets }),
        ...defineSpotifyCommands({ provider: AppSecrets, token: SPOTIFY_TOKEN, clientId: SPOTIFY_CLIENT_ID }),
    ],
});
```

`provider` is a service resolving to the project's `SecretsProvider`. `clientId` is any service resolving to
the Client ID, and a declared secret works as it is. `redirectUri` overrides the default
`http://127.0.0.1:8888/callback`; it must match the one registered on the app. Then, once:

```bash
bun secrets set SPOTIFY_CLIENT_ID --prompt="Spotify Client ID"
acme spotify auth
```

`auth` is run by a person: it opens a browser for the consent. The token lasts 6 months, then sign in again.

## Commands

Output is tab-separated, the Spotify URI first, so a line can be passed straight to `playlist add` or
`queue add`.

|Command|What it does|
|-|-|
|`auth`|Sign in (a person, in a browser)|
|`me`|The signed-in account and when the sign-in expires|
|`top artists\|tracks [--range]`|Most listened to, `short`, `medium` or `long` term|
|`recent`|Recently played tracks|
|`saved tracks\|albums`|The saved library|
|`following`|Followed artists|
|`search <query> [--type]`|Search artists, tracks, albums and playlists|
|`artist <uri>`|An artist and their albums|
|`album <uri>`|An album and its tracks|
|`playlist list`|The account's playlists|
|`playlist items <playlist>`|The tracks of a playlist|
|`now-playing`|The current track and progress|
|`playlist create <name>` (write)|A new private playlist (`--public` for public)|
|`playlist add <playlist> <uri>...` (write)|Adds tracks to a playlist, up to 100|
|`queue add <uri>` (write)|Adds a track or episode to the playback queue|
|`get <path> [--query]`|Any other `GET` of the Web API, as JSON|
|`schema [name] [--search] [--tag]`|Browses the Web API spec offline|

`get` and `schema` are the read-only escape hatch for what the curated commands do not cover: `schema` finds
the operation, `get` calls it. There is no generic write command. `get` signs in through the same unit as
the others, so its token is refreshed and stored the same way and never printed.

An agent permission rule should allow the reads and hold the three writes (`playlist create`,
`playlist add`, `queue add`) for confirmation.

## Programmatic use

Resolve the `defineSpotify` unit in a command scope and call the operations, plain functions over the typed
client:

```ts
import { CommandScope } from '@nzyme/cli-core/Command.js';
import { defineSpotify } from '@nzyme/spotify-cli/defineSpotify.js';
import { spotifyTopTracksList } from '@nzyme/spotify-cli/operations/spotifyTopTracksList.js';

const spotify = container.createChild(CommandScope).resolve(defineSpotify(options));
const api = await spotify.getApi();
const tracks = await spotifyTopTracksList(api, { range: 'short' });
```

`options` are the same `SpotifyOptions` as above. The operations are not ioc `defineCommand`s because the
client depends on per-project options (the secrets and the Client ID), which a static ioc unit cannot reach.

## Limits

- Endpoints Spotify removed for Development Mode apps are not offered: recommendations, related artists,
  audio features, artist top tracks, browse, batch lookups and other users' data.
- `search` returns at most 10 results per page.
- Playlist contents are readable only for the account's own and collaborative playlists.
- Short rate limits (`429`) are retried. A long one (`QUOTA_EXCEEDED`) fails with how long to wait.
