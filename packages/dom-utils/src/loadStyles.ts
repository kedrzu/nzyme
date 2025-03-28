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
 * Loads a stylesheet from a URL.
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
