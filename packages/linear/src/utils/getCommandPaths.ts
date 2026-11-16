/**
 * The clipanion paths of a command, behind the optional `prefix` the consumer registers the Linear
 * commands under (`task` + `push` → `task push`).
 */
export function getCommandPaths(options: { prefix?: string }, ...commands: string[]): string[][] {
    if (options.prefix) {
        return [[options.prefix, ...commands]];
    }

    return [[...commands]];
}
