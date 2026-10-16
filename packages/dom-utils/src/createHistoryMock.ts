/**
 * A browser session history for tests, standing in for the `window`, `history` and `document` globals.
 */
export interface HistoryMock {
    /** Address of the current entry. */
    readonly url: string;
    /** Addresses of all entries, oldest first. */
    readonly urls: readonly string[];
    /** Position of the current entry in `urls`. */
    readonly index: number;
    /** Waits until every step through the history asked for so far has landed. */
    settle(): Promise<void>;
    /** Puts back the globals the mock replaced. */
    restore(): void;
}

interface HistoryMockEntry {
    url: string;
    state: unknown;
}

class PopStateEventMock extends Event {
    constructor(readonly state: unknown) {
        super('popstate');
    }
}

const GLOBALS = ['window', 'history', 'document'] as const;

/**
 * Replaces the `window`, `history` and `document` globals with a session history held in memory, starting
 * with one entry at `url`. Like a browser, `pushState` and `replaceState` take effect at once, and a step
 * (`back`, `forward`, `go`) lands later with a `popstate` on `window`: it goes from the entry that was
 * current when it was asked, as Chromium does, so a push made in between is stepped out of.
 */
export function createHistoryMock(url = '/'): HistoryMock {
    const entries: HistoryMockEntry[] = [{ url, state: null }];
    let index = 0;
    const steps = new Set<Promise<void>>();

    const fakeHistory = {
        scrollRestoration: 'auto',
        get length() {
            return entries.length;
        },
        get state(): unknown {
            return structuredClone(current().state);
        },
        pushState(state: unknown, _title: string, entryUrl?: string | URL | null) {
            entries.splice(index + 1, entries.length, {
                url: entryUrl == null ? current().url : String(entryUrl),
                state: structuredClone(state),
            });
            index++;
        },
        replaceState(state: unknown, _title: string, entryUrl?: string | URL | null) {
            entries[index] = {
                url: entryUrl == null ? current().url : String(entryUrl),
                state: structuredClone(state),
            };
        },
        back() {
            go(-1);
        },
        forward() {
            go(1);
        },
        go,
    };
    const fakeWindow = Object.assign(new EventTarget(), { history: fakeHistory });
    const fakeDocument = { title: '' };

    const replaced = GLOBALS.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of [
        ['window', fakeWindow],
        ['history', fakeHistory],
        ['document', fakeDocument],
    ] as const) {
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }

    return {
        get url() {
            return current().url;
        },
        get urls() {
            return entries.map(entry => entry.url);
        },
        get index() {
            return index;
        },
        settle,
        restore() {
            for (const [name, descriptor] of replaced) {
                if (descriptor) {
                    Object.defineProperty(globalThis, name, descriptor);
                } else {
                    Reflect.deleteProperty(globalThis, name);
                }
            }
        },
    };

    function current() {
        const entry = entries[index];
        if (!entry) {
            throw new Error(`No history entry at ${index}`);
        }

        return entry;
    }

    function go(delta = 0) {
        const target = index + delta;
        const step = new Promise<void>(resolve => {
            setTimeout(() => {
                steps.delete(step);
                resolve();
                land(delta, target);
            });
        });
        steps.add(step);
    }

    function land(delta: number, target: number) {
        const entry = entries[target];
        if (delta === 0 || !entry) {
            return;
        }

        index = target;
        fakeWindow.dispatchEvent(new PopStateEventMock(structuredClone(entry.state)));
    }

    async function settle(): Promise<void> {
        if (steps.size === 0) {
            return;
        }

        await Promise.all(steps);
        return settle();
    }
}
