/** Returns true if the given module source is a local file that should be watched for changes. */
export function shouldWatch(source: string) {
    if (/^node:/.test(source) || /^[\w_-]+$/.test(source)) {
        // Node built-in modules and third party modules
        return false;
    }

    if (source.includes('/node_modules/')) {
        return false;
    }

    return true;
}
