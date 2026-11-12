import type { AffectedRewrite } from './AffectedConfig.js';

/**
 * The paths a changed file also stands for under the `rewrites` rules — one per rule whose `from`
 * ends the path, whether or not that path exists; `[]` when no rule matches.
 * @__NO_SIDE_EFFECTS__
 */
export function rewriteChangedPath(file: string, rewrites: AffectedRewrite[]): string[] {
    const rewritten: string[] = [];
    for (const rewrite of rewrites) {
        if (file.endsWith(rewrite.from)) {
            rewritten.push(file.slice(0, -rewrite.from.length) + rewrite.to);
        }
    }
    return rewritten;
}
