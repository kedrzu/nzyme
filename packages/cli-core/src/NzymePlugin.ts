import type { CommandClass } from './Command.js';

/**
 * What a plugin module default-exports. A repo lists its plugins in the root `package.json`, under
 * `nzyme.plugins`, and the `nzyme` binary adds their commands to its own.
 */
export interface NzymePlugin {
    /** Commands to add to the binary. Must extend the `Command` of the `@nzyme/cli-core` it runs. */
    commands: CommandClass[];
}
