import type { LinearCommandsOptions, LinearConfig } from '../cli/defineLinearCommands.js';

/** Resolves the consumer's `linear` option, which may be the config, or a (async) function returning it. */
export async function getLinearConfig(options: Pick<LinearCommandsOptions, 'linear'>): Promise<LinearConfig> {
    if (typeof options.linear === 'function') {
        return await options.linear();
    }

    return options.linear;
}
