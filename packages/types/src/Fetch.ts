/** Runtime-agnostic request transport compatible with browser, Bun, and Node fetch implementations. */
export interface Fetch {
    (input: string | Request | URL, init?: RequestInit): Promise<Response>;
}
