/**
 * The one-line stderr hint that a list goes on, with the option and value that reads the next page.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatSpotifyMoreHint(option: string, value: string | number): string {
    return `More results: rerun with ${option} ${value}.\n`;
}
