# @nzyme/ticketmaster-cli

The Ticketmaster [Discovery API v2](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
for agents and code: find concerts by artist, place and date, resolve artists and venues to ids, list
genres. It ships a typed client you can call from code, and CLI commands with compact line output.
Read-only: the Discovery API cannot buy tickets.

## Installation

```bash
bun add @nzyme/ticketmaster-cli @nzyme/cli-core
```

## Get your API key in 2 minutes

Every user brings their own key; the package ships none.

1. Open [developer.ticketmaster.com](https://developer.ticketmaster.com/) and register (**Get your API
   key**). Confirm the email.
2. Go to **My Apps**. Registration creates a default app; its **Consumer Key** is the API key (the
   Consumer Secret is not used).
3. Store it as a secret (below). Never paste it into a chat, a file or a command argument.

The default quota is 5000 calls a day at 5 requests a second. Paging stops at the 1000th item
(`size * page < 1000`). Coverage outside North America depends on what Ticketmaster's local
businesses publish (Poland included); the International Discovery API no longer accepts new keys, so
this package uses only Discovery v2.

## Register the commands

Declare the key with `defineSecret` in the product's secrets module and spread the commands into the
product CLI's `execute`:

```ts
// secrets.ts
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

export const TICKETMASTER_API_KEY = defineSecret('TICKETMASTER_API_KEY', {
    description: 'Ticketmaster Discovery API key (developer.ticketmaster.com → My Apps → Consumer Key)',
});
```

```ts
// cli.ts
import { execute } from '@nzyme/cli-core/execute.js';
import { defineTicketmasterCommands } from '@nzyme/ticketmaster-cli/defineTicketmasterCommands.js';

import { TICKETMASTER_API_KEY } from './secrets.js';

await execute({
    name: 'acme',
    container, // with the secrets loaded (`loadSecretsConfig`)
    commands: [
        // ...the product's other commands
        ...defineTicketmasterCommands({
            apiKey: TICKETMASTER_API_KEY,
            // Default `*`: every locale. The API's own default, `en-us`, drops events published only
            // in another language.
            locale: 'pl-pl,en-us,*',
        }),
    ],
});
```

Then store the value through a masked prompt:

```sh
bun secrets set TICKETMASTER_API_KEY --prompt="Ticketmaster: developer.ticketmaster.com → My Apps → Consumer Key"
```

The key is resolved only when a command sends a request, so `--help` works without it. Options:
`prefix` (default `ticketmaster`), `locale`, and `baseUrl` (for tests and proxies).

## Commands

Every list command prints one tab-separated line per item and ends with a footer
`# page N/M, T events` (`# 0 events` when nothing matched).

|Command|Prints|
|-|-|
|`ticketmaster events --city Warsaw --from 2026-12-01 --to 2026-12-31`|id, local date, local time, name, venue, city, country, price range, status, url|
|`ticketmaster event <id>`|a `key: value` block: dates, status, venue and address, attractions with ids, genre, prices, sales and presales, url, notes|
|`ticketmaster attractions "Arctic Monkeys"`|id, name, genre, upcoming events, external links (`spotify=…`, `musicbrainz=<mbid>`, `homepage=…`)|
|`ticketmaster venues Torwar --country PL`|id, name, city, country, address, upcoming events|
|`ticketmaster classifications`|genre id and name of the Music segment (`--segment <id>` for another)|

`events` filters: `--keyword`, `--artist-id` (an attraction id from `attractions`), `--venue-id`,
`--country PL`, `--city`, `--near <lat,long>` with `--radius-km`, `--from`/`--to`, `--genre <name>`,
`--segment <name>|all` (default `Music`), `--size` (at most 200), `--page` (from 0). It sorts by date.

The external links of `attractions` are how you cross-match an artist with Spotify or MusicBrainz:
the Discovery API cannot search by those ids.

### The date window

`--from`/`--to` are dates in the event's local time. The documented `startDateTime`/`endDateTime`
filters are UTC, so the command widens them by a day on each side and drops events whose local date is
outside the window. A page may therefore show fewer than `--size` events, and the footer total counts
the dropped ones.

The API also lists a `localStartDateTime` range filter, but its format is undocumented. Once someone
with a key confirms the format (for example `2026-12-01T00:00:00,2026-12-31T23:59:59`), the command
can switch to it and drop the client-side filter.

## Use from code

The client needs no CLI and no container:

```ts
import { createTicketmasterClient } from '@nzyme/ticketmaster-cli/createTicketmasterClient.js';
import { TicketmasterEventSearch } from '@nzyme/ticketmaster-cli/TicketmasterEventSearch.js';

const ticketmaster = createTicketmasterClient({ apiKey, locale: 'pl-pl,en-us,*' });

const { items, page } = await ticketmaster(TicketmasterEventSearch, {
    attractionId: 'K8vZ9171ob7',
    countryCode: 'PL',
    segmentName: 'Music',
    sort: 'date,asc',
});
```

`apiKey` is a string or a function returning one (read on every request). The endpoints are
`TicketmasterEventSearch`, `TicketmasterEventGet` (`null` when the event does not exist),
`TicketmasterAttractionSearch`, `TicketmasterVenueSearch` and `TicketmasterSegmentGet`. List endpoints
return `{ items, page }` unwrapped from the API's HAL envelope; the types in `TicketmasterTypes.ts`
model only the commonly read fields.

There is no throttling: stay under 5 requests a second when you loop.

## Errors

A failed request throws `TicketmasterError` with `data: { operation, status }`. The key travels in the
`apikey` query parameter, so the error never carries the url, the response or its body: a 401/403 says
the key was rejected, a 429 names both limits and the reset time, and a network failure names only the
error code.

## Why no OpenAPI codegen

Ticketmaster's only machine-readable spec (Swagger 2.0 in `ticketmaster-api/ticketmaster-api.github.io`,
last changed 2016) models every query as a single `body` parameter and every response as a bare array,
while the API returns HAL. The endpoints are therefore hand-modelled (`defineEndpoint`).
