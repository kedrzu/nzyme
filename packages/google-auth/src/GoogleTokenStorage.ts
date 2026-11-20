/** Where a service's token dictionary lives: the raw value of its token secret. */
export interface GoogleTokenStorage {
    /** The stored value; `undefined` when nothing is stored. */
    read(): Promise<string | undefined>;
    /** Replaces the stored value. */
    write(value: string): Promise<void>;
    /**
     * Throws when `write` would be refused, without writing; sign-in calls it before the browser step.
     * Optional: without it, a refusal surfaces only from `write`.
     */
    assertWritable?(): void;
}
