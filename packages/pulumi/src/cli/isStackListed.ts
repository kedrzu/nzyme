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
     * Whether the remote state could be read. When it could not, `remote` says nothing about the stack.
     */
    remoteKnown: boolean;

    /**
     * Whether `list --all` was passed, which lists every stack.
     */
    all: boolean;
}

/**
 * Whether `list` shows a locally defined stack. A disabled stack with no live state is one this
 * environment never deploys, so it is hidden unless `--all` is passed; a disabled stack that still holds
 * resources stays visible, since it points at something left behind. When the remote state is unknown, a
 * disabled stack may still hold resources, so it is listed.
 */
export function isStackListed({ stack, remote, remoteKnown, all }: IsStackListedOptions): boolean {
    return all || stack.enabled || !remoteKnown || (remote !== undefined && !remote.isDestroyed);
}
