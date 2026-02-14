const CACHE_SYMBOL = Symbol('script-cache');
/**
 * Options for {@link loadScript}.
 */
export interface LoadScriptOptions {
    /**
     * The document to load the script into.
     */
    document?: Document;
}

type ScriptCache = {
    [CACHE_SYMBOL]?: {
        [key: string]: Promise<void> | undefined;
    };
};

/**
 * Loads a JavaScript file into the page by creating a script tag.
 * If the script was already loaded, returns the existing Promise without loading it again.
 *
 * @param url The URL of the script to load
 * @param options Additional options for loading the script
 * @returns A Promise that resolves when the script has been loaded, or rejects on error
 */
export function loadScript(url: string, options?: LoadScriptOptions) {
    const cache = getScriptCache((options?.document ?? document) as ScriptCache);
    if (cache[url]) {
        return cache[url];
    }

    const promise = new Promise<void>((resolve, reject) => {
        const doc = options?.document ?? document;
        const scriptTag = doc.createElement('script');

        scriptTag.src = url;
        scriptTag.onload = () => resolve();
        scriptTag.onerror = e => {
            doc.body.removeChild(scriptTag);
            // Remove pending promise from cache
            if (cache[url] === promise) {
                delete cache[url];
            }

            reject(new Error(`Failed to load script: ${url}`, { cause: e }));
        };

        doc.body.appendChild(scriptTag);
    });

    cache[url] = promise;

    return promise;
}

/**
 * Gets the script cache object from a document or creates one if it doesn't exist.
 * Uses a Symbol to avoid conflicts with other properties.
 *
 * @param cache The document or object to use as cache storage
 * @returns The script cache object for the document
 */
function getScriptCache(cache: ScriptCache) {
    if (!cache[CACHE_SYMBOL]) {
        cache[CACHE_SYMBOL] = {};
    }

    return cache[CACHE_SYMBOL];
}
