const styles: { [key: string]: Promise<void> | undefined } = {};

/**
 * Options for {@link loadStyles}.
 */
export interface LoadStylesOptions {
    /**
     * The document to load the stylesheet into.
     */
    document?: Document;
}

/**
 * Loads a CSS stylesheet from a URL into the document head.
 * If the stylesheet has already been loaded, returns the existing Promise.
 * Provides cross-browser compatibility for stylesheet loading events.
 * @util
 *
 * @param url The URL of the stylesheet to load
 * @param options Additional options for loading the stylesheet
 * @returns A Promise that resolves when the stylesheet has been loaded, or rejects on error
 */
export function loadStyles(url: string, options?: LoadStylesOptions) {
    if (styles[url]) {
        return styles[url];
    }

    const doc = options?.document ?? document;
    const css = doc.createElement('link');

    return new Promise<void>((resolve, reject) => {
        css.rel = 'stylesheet';
        css.type = 'text/css';
        css.href = url;

        if (typeof css.onload != 'undefined') {
            css.onload = () => resolve();
            css.onerror = (_event, _source, _lineno, _colno, err) => {
                doc.head.removeChild(css);
                reject(err ?? new Error(`Failed to load styles from ${url}`));
            };
            doc.head.appendChild(css);
        } else {
            // A hack for cross-browser support.
            // Some older browsers do not support onload event,
            // https://stackoverflow.com/a/56310332/2202583
            const img = doc.createElement('img');
            img.onerror = () => {
                resolve();
                doc.body.removeChild(img);
            };
            img.src = url;

            doc.head.appendChild(css);
            doc.body.appendChild(img);
        }
    });
}
