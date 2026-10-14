const START_MARKER = '<!-- submodule-prs-start -->';
const END_MARKER = '<!-- submodule-prs-end -->';
const HEADER = '## Submodule PRs';

/**
 * Captures the URL of a line in the format {@link formatLink} writes:
 * `- **name**: [owner/repo#123](url) title`.
 */
const LINK_LINE_URL = /^- \*\*[^*]+\*\*: \[[^\]]+\]\(([^)\s]+)\)/;

/**
 * A submodule pull request to link from a main repository PR description.
 */
export interface SubmodulePrLink {
    /**
     * Submodule name as configured in `.gitmodules`.
     */
    submodule: string;
    owner: string;
    repo: string;
    number: number;
    title: string;
    /**
     * The PR's `html_url` — also the identity of its line in the block.
     */
    url: string;
}

/**
 * Write the managed "Submodule PRs" block into a PR description.
 *
 * Only the text between the `<!-- submodule-prs-start -->` / `<!-- submodule-prs-end -->` markers is
 * ever rewritten; when the block is absent it is appended after a blank line. Everything else stays
 * byte-for-byte as it was.
 *
 * Entries accumulate and never disappear: a submodule PR merged before the main PR can no longer be
 * resolved from the submodule's branch, yet the reviewer still needs its link. So the lines already in
 * the block are kept in their order, a link found now overwrites the line with its URL (a renamed PR),
 * and links not yet listed are appended.
 *
 * @returns the new body, or `null` when it would not change — so the caller skips the API call.
 * @throws when the markers are not exactly one start followed by one end: rewriting a span between
 * mismatched markers could swallow human-written text.
 * @__NO_SIDE_EFFECTS__
 */
export function upsertSubmodulePrLinks(body: string | null, links: readonly SubmodulePrLink[]): string | null {
    const current = body ?? '';
    const start = current.indexOf(START_MARKER);
    const end = current.indexOf(END_MARKER);

    if (start === -1 && end === -1) {
        if (links.length === 0) {
            return null;
        }

        const block = formatBlock(mergeLines([], links));
        return current === '' ? block : `${current}${blockSeparator(current)}${block}`;
    }

    const markersMalformed =
        start === -1 ||
        end === -1 ||
        end < start ||
        current.lastIndexOf(START_MARKER) !== start ||
        current.lastIndexOf(END_MARKER) !== end;
    if (markersMalformed) {
        throw new Error(`Malformed submodule PR block: ${START_MARKER} and ${END_MARKER} must appear once, in order`);
    }

    const blockEnd = end + END_MARKER.length;
    const existingBlock = current.slice(start, blockEnd);
    const existingLines = current
        .slice(start + START_MARKER.length, end)
        .split(/\r?\n/)
        // The header and blank lines are re-generated; any other line — ours or one somebody added
        // inside the block — is kept untouched, so nothing anyone wrote is ever dropped.
        .filter(line => line.trim() !== '' && line !== HEADER);

    const block = formatBlock(mergeLines(existingLines, links));
    if (block === existingBlock) {
        return null;
    }

    return `${current.slice(0, start)}${block}${current.slice(blockEnd)}`;
}

function mergeLines(existingLines: readonly string[], links: readonly SubmodulePrLink[]): string[] {
    const pending = new Map(links.map(link => [link.url, link]));

    const lines = existingLines.map(line => {
        const url = LINK_LINE_URL.exec(line)?.[1];
        const link = url === undefined ? undefined : pending.get(url);
        if (url === undefined || link === undefined) {
            return line;
        }

        pending.delete(url);
        return formatLink(link);
    });

    for (const link of pending.values()) {
        lines.push(formatLink(link));
    }

    return lines;
}

function formatLink(link: SubmodulePrLink): string {
    return `- **${link.submodule}**: [${link.owner}/${link.repo}#${link.number}](${link.url}) ${link.title}`;
}

function formatBlock(lines: readonly string[]): string {
    return [START_MARKER, HEADER, '', ...lines, END_MARKER].join('\n');
}

function blockSeparator(body: string): string {
    if (body.endsWith('\n\n')) {
        return '';
    }

    return body.endsWith('\n') ? '\n' : '\n\n';
}
