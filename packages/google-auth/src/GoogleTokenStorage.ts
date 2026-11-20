/** Where a service's token dictionary lives: the raw value of its token secret. */
export interface GoogleTokenStorage {
    /** The stored value; `undefined` when nothing is stored. */
    read(): Promise<string | undefined>;
    /** Replaces the stored value. */
    write(value: string): Promise<void>;
}
