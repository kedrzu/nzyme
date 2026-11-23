import type { CommandClass } from '@nzyme/cli-core/Command.js';
import type { FetchClient } from '@nzyme/fetch-utils/defineFetchClient.js';
import type { Injectable } from '@nzyme/ioc/Injectable.js';

import type { LastfmClientOptions } from './defineLastfmClient.js';
import { defineLastfmClient } from './defineLastfmClient.js';
import { defineLastfmAlbumCommand } from './defineLastfmAlbumCommand.js';
import { defineLastfmArtistCommand } from './defineLastfmArtistCommand.js';
import { defineLastfmArtistTopCommand } from './defineLastfmArtistTopCommand.js';
import { defineLastfmChartCommand } from './defineLastfmChartCommand.js';
import { defineLastfmSearchCommand } from './defineLastfmSearchCommand.js';
import { defineLastfmSimilarArtistsCommand } from './defineLastfmSimilarArtistsCommand.js';
import { defineLastfmSimilarTracksCommand } from './defineLastfmSimilarTracksCommand.js';
import { defineLastfmTagCommand } from './defineLastfmTagCommand.js';
import { defineLastfmTagTopCommand } from './defineLastfmTagTopCommand.js';
import { defineLastfmTrackCommand } from './defineLastfmTrackCommand.js';
import { defineLastfmUserRecentCommand } from './defineLastfmUserRecentCommand.js';
import { defineLastfmUserTopCommand } from './defineLastfmUserTopCommand.js';

/** Options of {@link defineLastfmCommands}: the client's options plus the command prefix. */
export interface LastfmCommandsOptions extends LastfmClientOptions {
    /** The command path prefix, space-separated. Default `lastfm`. */
    prefix?: string;
}

/** What every Last.fm command is defined with. */
export interface LastfmCommandParams {
    /** The command path prefix, space-separated (`lastfm`). */
    prefix: string;
    /** The set's `LastfmClient` from `defineLastfmClient`, created once per command set. */
    client: Injectable<FetchClient>;
}

/**
 * Defines the read-only Last.fm discovery commands: similar artists and tracks, artist, album, track
 * and tag profiles, top lists, search, the global charts, and a user's top lists and recent tracks.
 * Lists print one tab-separated line per item; profiles print a `key: value` block. A missing artist,
 * album, track, tag or user prints `Not found: …` to stderr and exits 1. Spread them into a product
 * CLI's `execute({ commands })`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmCommands(options: LastfmCommandsOptions): CommandClass[] {
    const { prefix = 'lastfm', ...clientOptions } = options;
    const params: LastfmCommandParams = { prefix, client: defineLastfmClient(clientOptions) };

    return [
        defineLastfmSimilarArtistsCommand(params),
        defineLastfmSimilarTracksCommand(params),
        defineLastfmArtistCommand(params),
        defineLastfmArtistTopCommand(params),
        defineLastfmAlbumCommand(params),
        defineLastfmTrackCommand(params),
        defineLastfmTagCommand(params),
        defineLastfmTagTopCommand(params),
        defineLastfmSearchCommand(params),
        defineLastfmChartCommand(params),
        defineLastfmUserTopCommand(params),
        defineLastfmUserRecentCommand(params),
    ];
}
