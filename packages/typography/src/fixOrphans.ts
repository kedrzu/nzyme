const spaceAfterShortWordRegex = /([\s(]|^)(\w{1,2})\s/gmu;
const longWordRegex = /\s([^\s]{12,})/gmu;

/**
 * Search for any word, that is 3 or less characters long
 * Such short words should not end up on the end of the line.
 * We add non-breakable space at the end of the word.
 * Source: https://boanastudio.com/blog/text-in-responsive-web-design
 * @param text Text to fix
 */
export function fixOrphans(text: string) {
    // use [^\s] to match anything but whitespace characters
    return (
        text
            .replace(spaceAfterShortWordRegex, (_search, whitespace: string, word: string) => {
                // replace spaces between short words with a non-breakable space
                // do not swap it with any other character!
                return whitespace + word + '\u00a0';
            })
            // roll back the operation if following word has 12 or more letters
            .replace(longWordRegex, (_search, group: string) => {
                return ' ' + group;
            })
    );
}
