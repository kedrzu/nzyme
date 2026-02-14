import { install } from 'source-map-support';

import { patchNodeWarnings } from '@nzyme/node-utils/patchNodeWarnings.js';

/**
 * Initialize the CLI.
 */
export function initialize() {
    install();
    patchNodeWarnings();
}
