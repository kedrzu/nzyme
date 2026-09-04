import presetEnv from '@babel/preset-env';
import type { ConfigAPI, PresetItem, PresetObject } from '@babel/core';

import { cloudFrontMethodsPlugin } from './cloudFrontMethodsPlugin.js';

/**
 * Syntax `cloudfront-js-2.0` supports beyond ES 5.1. Downleveling it buys nothing and costs bytes
 * against a 10 240 byte limit, so preset-env is told to leave it alone.
 *
 * `transform-async-to-generator` and `transform-regenerator` are excluded together: the runtime runs
 * `async`/`await` natively, and the regenerator runtime they would otherwise pull in is far too big
 * for an edge function. The runtime's own limit — no `async` closures passed as arguments — is not
 * expressible here; no CloudFront Function uses `async` today.
 */
const PRESET_ENV_EXCLUDE = [
    'transform-arrow-functions',
    'transform-async-to-generator',
    'transform-block-scoping',
    'transform-exponentiation-operator',
    'transform-named-capturing-groups-regex',
    'transform-numeric-separator',
    'transform-regenerator',
    'transform-sticky-regex',
    'transform-template-literals',
    'transform-typeof-symbol',
];

/**
 * `PresetObject` in `@babel/core` 8 omits `presets`, even though Babel resolves nested presets. Typed
 * here so the preset does not have to be cast away.
 */
interface CloudFrontPresetObject extends PresetObject {
    presets: PresetItem[];
}

/**
 * Babel preset for CloudFront Functions. `cloudfront-js-2.0` is an allowlist rather than an engine
 * version, so no `targets` entry describes it: ES 5.1 is the floor (hence the `ie 11` target), the
 * exclusions above put back the syntax the runtime does have, and
 * {@link cloudFrontMethodsPlugin} covers the half preset-env never touches — built-in methods.
 */
export function cloudFrontFunctionPreset(api: ConfigAPI): CloudFrontPresetObject {
    api.cache.forever();

    return {
        presets: [
            [
                presetEnv,
                {
                    targets: { ie: '11' },
                    exclude: PRESET_ENV_EXCLUDE,
                    // No polyfills exist on this runtime, so injecting imports for them would only
                    // break the bundle.
                    useBuiltIns: false,
                },
            ],
        ],
        plugins: [cloudFrontMethodsPlugin],
    };
}
