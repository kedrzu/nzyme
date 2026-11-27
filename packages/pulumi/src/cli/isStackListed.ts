import type { StackDefinition } from '../defineStack.js';
import type { RemoteStackInfo } from '../utils/listRemoteStacks.js';

export interface IsStackListedOptions {
    /**
     * Stack defined locally.
     */
    stack: StackDefinition;

    /**
     * Its state in the remote backend, if it has any.
     */
    remote: RemoteStackInfo | undefined;

    /**
     * Whether `list --all` was passed, which lists every stack.
     */
    all: boolean;
}

/**
 * Whether `list` shows a locally defined stack. A disabled stack with no live state is one this
 * environment never deploys, so it is hidden unless `--all` is passed; a disabled stack that still holds
 * resources stays visible, since it points at something left behind.
 */
export function isStackListed({ stack, remote, all }: IsStackListedOptions): boolean {
    return all || stack.enabled || (remote !== undefined && !remote.isDestroyed);
}
