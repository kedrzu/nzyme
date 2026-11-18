/** What the browser is launched with. */
export interface BuildStealthArgsOptions {
    /** The profile folder: cookies and logins. */
    userDataDir: string;
    /** Appended last, e.g. `--headless=new`. */
    args?: string[];
}

/**
 * The browser's base command line: driven over the pipe only (no debugging port, so no other local process can reach
 * it). `AutomationControlled` off: the pipe alone makes Chrome report `navigator.webdriver = true` to every page, and
 * the flag turns that off without giving up the pipe. On macOS `--use-mock-keychain` keeps the Keychain out: without it
 * the first network request waits on a Keychain access prompt for the cookie key, which either steals focus or, from a
 * background process, never resolves; the profile's cookies are then protected by the folder they live in, not by the
 * Keychain.
 * @__NO_SIDE_EFFECTS__
 */
export function buildStealthArgs(options: BuildStealthArgsOptions) {
    return [
        `--user-data-dir=${options.userDataDir}`,
        '--remote-debugging-pipe',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
        ...(options.args ?? []),
    ];
}
