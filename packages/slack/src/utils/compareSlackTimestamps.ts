/** A Slack timestamp split into its integer seconds and (zero-padded to 6 digits) microseconds, the
 *  only shape it is safe to compare numerically. */
interface SlackTimestampParts {
    seconds: number;
    microseconds: number;
}

/**
 * Compares two Slack message timestamps numerically, as a (seconds, microseconds) pair — the two
 * halves of `<seconds>.<microseconds>` — never as strings and never as a single parsed float.
 * Comparing as text breaks whenever the fractional part carries a different number of digits:
 * `'1789987660.204059'` sorts *before* `'1789987660.20406'` lexicographically ('204059' < '20406' as
 * text), even though 0.20406 is the later instant. A single `Number(ts)` parse is unsafe too — a
 * 10-digit seconds part plus 6-digit microseconds is 16 significant digits, past float64's exact
 * range, so precision can silently drop the last microsecond digits. Splitting on `.` and comparing
 * each integer half avoids both failure modes. Returns negative if `a` is earlier, positive if
 * later, 0 if equal — the same contract as `Array.prototype.sort`'s comparator.
 * @__NO_SIDE_EFFECTS__
 */
export function compareSlackTimestamps(a: string, b: string): number {
    const partsA = parseSlackTimestamp(a);
    const partsB = parseSlackTimestamp(b);

    if (partsA.seconds !== partsB.seconds) {
        return partsA.seconds - partsB.seconds;
    }
    return partsA.microseconds - partsB.microseconds;
}

/** Slack always emits 6 fractional digits; padded defensively since nothing guarantees a
 *  caller-supplied `--after` value does too. */
function parseSlackTimestamp(ts: string): SlackTimestampParts {
    const [secondsPart, microsecondsPart = ''] = ts.split('.');
    return {
        seconds: Number(secondsPart),
        microseconds: Number(microsecondsPart.padEnd(6, '0').slice(0, 6)),
    };
}
