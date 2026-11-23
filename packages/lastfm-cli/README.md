# @nzyme/lastfm-cli

Last.fm as a music-discovery engine for agents and code: similar artists and tracks, tags and their top
artists/albums/tracks, artist/album/track info, charts, and a user's listening history. Two layers:

- **A typed client** — one endpoint per Last.fm method, run by a `LastfmClient` service. Last.fm's JSON
  quirks (`@attr`, `#text`, a one-item list sent as an object, numbers as strings, `""` for an empty
  list, errors inside a 200) are normalised away: lists are arrays, numbers are numbers, a missing MBID
  is `null`.
- **CLI commands** — `defineLastfmCommands()` returns compact, tab-separated discovery commands for a
  product CLI.

Read-only, and only the methods that need nothing but an API key: no scrobbling, no sessions.

## Installation

```bash
bun add @nzyme/lastfm-cli @nzyme/cli-core @nzyme/ioc
```

## Get your API key in 2 minutes

Every user brings their own key; the package ships none.

1. Sign in to Last.fm (or create a free account).
2. Open https://www.last.fm/api/account/create.
3. Fill in **Contact email**, **Application name** and a one-line **Application description**. Leave
   **Callback URL** and **Application homepage** empty — read-only calls do not need them.
4. Submit, then copy the **API key**. The **Shared secret** is not needed; do not store it.
5. Keep the key in the project's secret store, never in the repo:

   ```sh
   bun secrets set LASTFM_API_KEY --prompt="Last.fm API key: last.fm/api/accounts → API key"
   ```

Your applications are listed at https://www.last.fm/api/accounts.

## Register the commands in a CLI

Declare the secret next to the project's others:

```ts
// secrets.ts
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

export const LASTFM_API_KEY = defineSecret('LASTFM_API_KEY', {
    description: 'Last.fm API key, from https://www.last.fm/api/accounts',
});
```

Then spread the commands into the CLI:

```ts
import { execute } from '@nzyme/cli-core/execute.js';
import { defineLastfmCommands } from '@nzyme/lastfm-cli/defineLastfmCommands.js';

import { LASTFM_API_KEY } from './secrets.js';

await execute({
    name: 'my-cli',
    container,
    commands: [...defineLastfmCommands({ apiKey: LASTFM_API_KEY })],
});
```

Options: `apiKey` (any `Injectable<string>`; a declared secret is one), `prefix` (default `lastfm`),
`baseUrl` (default `https://ws.audioscrobbler.com/2.0/`), `userAgent`.

## Commands

|Command|Prints, one tab-separated line each|
|-|-|
|`similar-artists <artist> [--limit]`|artist, match, MBID|
|`similar-tracks <artist> <track> [--limit]`|artist, track, match, MBID|
|`artist <name>`|`key: value` profile (listeners, playcount, tags, short bio), then similar artists|
|`artist-top <name> tracks\|albums [--limit]`|rank, artist, title, playcount, MBID|
|`album <artist> <album>`|`key: value` profile, then the track list with durations|
|`track <artist> <track>`|`key: value` profile: stats, album, tags, summary|
|`tag <tag>`|`key: value`: reach, total, short description|
|`tag-top <tag> artists\|albums\|tracks [--limit]`|rank, artist, title (albums, tracks), MBID|
|`search artist\|album\|track <query> [--limit]`|artist, title (albums, tracks), listeners (artists, tracks), MBID|
|`chart artists\|tracks\|tags [--limit]`|rank, artist, title (tracks), playcount, MBID; tags: rank, name, reach|
|`user-top <user> artists\|albums\|tracks [--period] [--limit]`|rank, artist, title (albums, tracks), playcount, MBID|
|`user-recent <user> [--limit]`|time (ISO 8601 UTC, `now` while playing), artist, track, album, MBID|

Each command's `--help` lists its exact columns. Names are looked up with Last.fm's autocorrect; when the
name resolves to something else, a list command notes `# <resolved name>` on stderr. An MBID column is
empty when Last.fm has none. `--limit` defaults to 20 (max 200); `--period` is one of `overall` (the
default), `7day`, `1month`, `3month`, `6month`, `12month`. Something that does not exist prints
`Not found: …` on stderr and exits with 1.

## Use it from code

Define the client once and resolve it through the container; each endpoint is named after its Last.fm
method:

```ts
import { defineLastfmClient } from '@nzyme/lastfm-cli/defineLastfmClient.js';
import { LastfmArtistGetSimilar } from '@nzyme/lastfm-cli/LastfmArtistGetSimilar.js';

export const Lastfm = defineLastfmClient({ apiKey: LASTFM_API_KEY });

const lastfm = container.resolve(Lastfm);
const similar = await lastfm(LastfmArtistGetSimilar, { artist: 'Radiohead', limit: 10 });
// null when Last.fm does not know the artist
for (const artist of similar?.items ?? []) {
    console.log(artist.name, artist.match, artist.mbid);
}
```

Lookups take a name (`{ artist }`, `{ artist, track }`, `{ artist, album }`) or `{ mbid }`.

Endpoints: `LastfmArtistGetSimilar`, `LastfmArtistGetInfo`, `LastfmArtistGetTopTracks`,
`LastfmArtistGetTopAlbums`, `LastfmArtistSearch`, `LastfmAlbumGetInfo`, `LastfmAlbumSearch`,
`LastfmTrackGetSimilar`, `LastfmTrackGetInfo`, `LastfmTrackSearch`, `LastfmTagGetInfo`,
`LastfmTagGetTopArtists`, `LastfmTagGetTopAlbums`, `LastfmTagGetTopTracks`, `LastfmChartGetTopArtists`,
`LastfmChartGetTopTracks`, `LastfmChartGetTopTags`, `LastfmUserGetTopArtists`, `LastfmUserGetTopTracks`,
`LastfmUserGetTopAlbums`, `LastfmUserGetRecentTracks`.

## Errors and rate limits

- **Not found** (Last.fm error 6) is a return value: every lookup by name returns `null`. Searches and
  charts never do.
- **Anything else** throws `LastfmError` with `method`, `code` (the Last.fm error code, or `null`) and
  `status` (HTTP; `0` when no response arrived). Error 29 is the rate limit; 10 and 26 mean the key is
  invalid or suspended. The error never holds the URL, the response or its body, since the URL carries
  the API key.
- **Pacing:** one client starts requests at least 200 ms apart (at most 5 a second). Last.fm documents
  no number, only that sustained "several calls per second" can get an account suspended. There is no
  retry.

## Terms

Last.fm's API is free for non-commercial use, and its [terms](https://www.last.fm/api/tos) ask clients
to cache responses and identify themselves; requests send a `User-Agent` naming this package unless you
pass your own.
