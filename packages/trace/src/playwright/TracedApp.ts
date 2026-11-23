/**
 * A web app the browser of a traced test loads, and where its files are. Directories are absolute or
 * relative to the project root.
 */
export interface TracedApp {
    /** The origin the app is served from, e.g. `http://localhost:3000`. */
    origin: string;
    /**
     * The app's source `public/` directory: a URL path found there is a static asset of the app,
     * which a test fetching it depends on.
     */
    publicDir: string;
    /**
     * Where the built files the app serves live, with their source maps: a script URL path is a
     * file there, mapped back to the sources it was built from.
     */
    outputDir: string;
}
