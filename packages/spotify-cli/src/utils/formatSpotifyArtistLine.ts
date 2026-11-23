import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { SpotifyArtist } from '../SpotifyTypes.js';

/**
 * The line of an artist, `uri  name  genres`, tab-separated with a newline; genres joined by commas
 * and empty when Spotify lists none.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatSpotifyArtistLine(artist: SpotifyArtist): string {
    return formatTsvLine([artist.uri, artist.name, artist.genres.join(', ')]);
}
