const scripts: { [key: string]: Promise<void> | undefined } = {};

/**
 * Loads a given script into the page.
 * If script was already loaded, it won't load it again
 */
export function loadScript(url: string, options?: { document?: Document }) {
    if (scripts[url]) {
        return scripts[url];
    }

    const doc = options?.document ?? document;
    const scriptTag = doc.createElement('script');

    return new Promise<void>((resolve, reject) => {
        scriptTag.src = url;
        scriptTag.onload = () => resolve();
        scriptTag.onerror = e => {
            doc.body.removeChild(scriptTag);
            reject(new Error(`Failed to load script: ${url}`, { cause: e }));
        };
        doc.body.appendChild(scriptTag);
    });
}
