import { createHash } from 'node:crypto';

import type { OutputBundle, Plugin } from 'rollup';

/**
 * What an {@link outputFingerprintPlugin} tells its owner about the builds it has seen.
 */
export interface OutputFingerprintApi {
    /**
     * Whether the latest written build emitted output different from the build written before it.
     * `true` for the first build. Read it on the watcher's `BUNDLE_END`, which rollup emits after `writeBundle`.
     */
    outputChanged(): boolean;
}

/**
 * A rollup plugin that fingerprints the written output; its `api` exposes the result.
 */
export interface OutputFingerprintPlugin extends Plugin<OutputFingerprintApi> {
    api: OutputFingerprintApi;
}

/**
 * Creates a Rollup plugin that fingerprints every written build, so a watch-mode dev server can skip a reload when a
 * rebuild produced byte-identical code (rollup watch rebuilds on every watched file change and cannot cancel one —
 * e.g. a change that only touches data a transform strips).
 *
 * The fingerprint covers each emitted chunk's code and each asset's source, keyed by file name. Source maps are left
 * out (`.map` assets and the chunks' `map` field): they change with positions in the original sources even when the
 * code that runs does not.
 *
 * The fingerprint is committed in `writeBundle`, so a build that fails before its output is written is never the
 * baseline the next build is compared to.
 *
 * @returns A Rollup plugin whose `api.outputChanged()` answers for the latest written build
 *
 * @example
 * ```typescript
 * const fingerprint = outputFingerprintPlugin();
 * const watcher = watch({ ...config, plugins: [config.plugins, fingerprint] });
 * watcher.on('event', event => {
 *     if (event.code === 'BUNDLE_END' && fingerprint.api.outputChanged()) {
 *         reload();
 *     }
 * });
 * ```
 */
export function outputFingerprintPlugin(): OutputFingerprintPlugin {
    let pending: string | undefined;
    let written: string | undefined;
    let changed = true;

    return {
        name: 'output-fingerprint',
        api: {
            outputChanged: () => changed,
        },
        generateBundle: {
            // Run after every other plugin, so files they emit or rewrite are part of the fingerprint.
            order: 'post',
            handler(_options, bundle) {
                pending = fingerprintBundle(bundle);
            },
        },
        writeBundle() {
            changed = pending !== written;
            written = pending;
        },
    };
}

function fingerprintBundle(bundle: OutputBundle) {
    const hash = createHash('sha256');
    const files = Object.values(bundle).toSorted((a, b) => a.fileName.localeCompare(b.fileName));

    for (const file of files) {
        if (file.fileName.endsWith('.map')) {
            continue;
        }

        hash.update(file.fileName);
        hash.update('\0');
        hash.update(file.type === 'chunk' ? file.code : file.source);
        hash.update('\0');
    }

    return hash.digest('hex');
}
