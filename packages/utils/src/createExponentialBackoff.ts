import { waitFor } from './waitFor.js';

/**
 * Configuration options for exponential backoff.
 */
export interface ExponentialBackoffOptions {
    /** Maximum number of retries before giving up. Default: Infinity */
    maxRetries?: number;
    /** Base delay in milliseconds. Default: 1000 */
    baseDelay?: number;
    /** Backoff power/multiplier. Default: 2 */
    power?: number;
    /** Maximum delay cap in milliseconds. Default: 30000 */
    maxDelay?: number;
}

/**
 * Exponential backoff controller for retry logic.
 */
export interface ExponentialBackoff {
    /** Returns true if more retries are available */
    canRetry(): boolean;
    /** Waits for the backoff period and increments retry count. Call at end of retry loop. */
    backoff(): Promise<void>;
    /** Resets the retry counter (call on successful connection) */
    reset(): void;
    /** Current retry count */
    readonly retries: number;
}

/**
 * Creates an exponential backoff controller for retry logic.
 *
 * The delay is calculated as: `min(baseDelay * power^retries, maxDelay)` with ±10% jitter.
 * @util
 *
 * @example
 * ```typescript
 * const backoff = createExponentialBackoff({ maxRetries: 5 });
 *
 * while (backoff.canRetry()) {
 *   try {
 *     await connect();
 *     backoff.reset();
 *     break;
 *   } catch (err) {
 *     console.log(`Retry ${backoff.retries}/${5} failed`);
 *     await backoff.backoff(); // Wait before next retry
 *   }
 * }
 * ```
 *
 * @param options - Configuration options
 * @returns Exponential backoff controller
 */
export function createExponentialBackoff(options?: ExponentialBackoffOptions): ExponentialBackoff {
    const maxRetries = options?.maxRetries ?? Infinity;
    const baseDelay = options?.baseDelay ?? 1000;
    const power = options?.power ?? 2;
    const maxDelay = options?.maxDelay ?? 30000;

    let retries = 0;

    return {
        get retries() {
            return retries;
        },

        canRetry() {
            return retries < maxRetries;
        },

        async backoff() {
            const delay = Math.min(baseDelay * Math.pow(power, retries), maxDelay);
            // Add ±10% jitter to prevent thundering herd
            const jitter = delay * 0.1 * (Math.random() * 2 - 1);
            const actualDelay = Math.round(delay + jitter);

            retries++;
            await waitFor(actualDelay);
        },

        reset() {
            retries = 0;
        },
    };
}
