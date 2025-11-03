import { shouldWatch } from './shouldWatch.js';

/**
 *
 */
export function isFileExternal(source: string) {
    if (source.startsWith('./') || source.startsWith('../')) {
        return false;
    }

    if (shouldWatch(source)) {
        return false;
    }

    return true;
}
