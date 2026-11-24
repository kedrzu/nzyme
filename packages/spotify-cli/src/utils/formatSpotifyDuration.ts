/**
 * A duration in the `m:ss` of a player (`3:07`; minutes may pass 59).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatSpotifyDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
