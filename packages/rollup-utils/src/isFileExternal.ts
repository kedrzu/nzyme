import { shouldWatch } from './shouldWatch.js';

/** Determines whether a module source should be treated as external (not bundled). */
export function isFileExternal(source: string) {
    if (source.startsWith('./') || source.startsWith('../')) {
        return false;
    }

    if (shouldWatch(source)) {
        return false;
    }

    return true;
}
