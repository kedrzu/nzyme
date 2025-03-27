const CACHE_SYMBOL = Symbol('script-cache');
type ScriptCache = {
    [CACHE_SYMBOL]?: {
        [key: string]: Promise<void> | undefined;
    };
};

/**
 * Loads a given script into the page.
 * If script was already loaded, it won't load it again
 */
export function loadScript(url: string, options?: { document?: Document }) {
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

function getScriptCache(cache: ScriptCache) {
    if (!cache[CACHE_SYMBOL]) {
        cache[CACHE_SYMBOL] = {};
    }

    return cache[CACHE_SYMBOL];
}
