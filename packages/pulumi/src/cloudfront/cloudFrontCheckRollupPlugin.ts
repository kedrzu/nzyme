import type { Plugin } from 'rollup';

import { assertCloudFrontFunctionCode } from './assertCloudFrontFunctionCode.js';

/**
 * Runs {@link assertCloudFrontFunctionCode} on the emitted chunk.
 *
 * Must be placed AFTER the minifier in the plugin array: Rollup 4 calls `renderChunk` hooks in
 * plugin order, so this is what makes the check see the exact bytes that get uploaded — including
 * whatever the minifier rewrote.
 *
 * @param source Input file of the function, used in the error message.
 */
export function cloudFrontCheckRollupPlugin(source: string): Plugin {
    return {
        name: 'cloudfront-runtime-check',
        renderChunk(code) {
            assertCloudFrontFunctionCode(code, source);

            return null;
        },
    };
}
