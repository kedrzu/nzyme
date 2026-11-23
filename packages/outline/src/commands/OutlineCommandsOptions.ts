import type { Keychain } from '@nzyme/secrets/osKeychain.js';

import type { OutlineUser } from '../outline/OutlineTypes.js';

/** Options of {@link defineOutlineCommands}. */
export interface OutlineCommandsOptions {
    /** Command prefix the commands register under; `outline` (the default) gives `outline sync`. */
    prefix?: string;
    /** Base URL of the workspace, e.g. `https://app.getoutline.com`. */
    url: string;
    /** The workspace's public OAuth client (Settings → Applications, redirect `http://127.0.0.1/callback`). */
    clientId: string;
    /** The documents folder, relative to the repo's main checkout; `documents` by default. */
    folder?: string;
    /** Where documents gone from Outline with unsent local edits are moved, relative to the main checkout; `recovered` by default. */
    recovered?: string;
    /**
     * The name of the user's own private collection (one with no workspace-wide permission), where a file put at
     * the root of the documents folder is created. Sync never creates the collection: while none matches, such
     * files are not sent and the agent is told.
     */
    privateCollection: (user: OutlineUser) => string;
    /** How the agent runs these commands, e.g. `bun run cli outline`; the prefix by default. */
    commandHint?: string;
    /** The language the agent speaks to the user, e.g. `Polish`; unset, the user's own language. */
    userLanguage?: string;
    /** Where the login is kept; the OS keychain by default. For tests. */
    keychain?: Keychain;
    /** Opens the authorize URL of `login`; macOS `open` by default. For tests. */
    openBrowser?: (url: string) => Promise<void>;
}
