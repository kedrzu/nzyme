import { waitFor } from '@nzyme/utils/waitFor.js';

/** `create` is for the stricter create-type endpoints (`documents.create`, `attachments.create`). */
export type OutlineRateLimitKind = 'general' | 'create';

export interface RateLimiterOptions {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

/** Paces requests to Outline's limits: 100 per minute overall, 25 per minute for create-type calls. */
export interface RateLimiter {
    /** Resolves when the call may be sent; a create-type call takes a token from both buckets. */
    acquire(kind: OutlineRateLimitKind): Promise<void>;
}

const MINUTE_MS = 60_000;
const GENERAL_PER_MINUTE = 100;
const CREATE_PER_MINUTE = 25;

/** Creates a limiter whose buckets start full and refill continuously. */
export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? waitFor;
    const general = createBucket(GENERAL_PER_MINUTE);
    const create = createBucket(CREATE_PER_MINUTE);

    return { acquire };

    async function acquire(kind: OutlineRateLimitKind) {
        const buckets = kind === 'create' ? [general, create] : [general];
        for (;;) {
            const waitMs = Math.max(...buckets.map(bucket => msUntilToken(bucket)));
            if (waitMs <= 0) {
                for (const bucket of buckets) {
                    bucket.tokens -= 1;
                }
                return;
            }
            await sleep(waitMs);
        }
    }

    function createBucket(perMinute: number): Bucket {
        return { perMinute, tokens: perMinute, refilledAt: now() };
    }

    function msUntilToken(bucket: Bucket) {
        const current = now();
        const refill = ((current - bucket.refilledAt) * bucket.perMinute) / MINUTE_MS;
        bucket.tokens = Math.min(bucket.perMinute, bucket.tokens + refill);
        bucket.refilledAt = current;
        if (bucket.tokens >= 1) {
            return 0;
        }
        return Math.ceil(((1 - bucket.tokens) * MINUTE_MS) / bucket.perMinute);
    }
}

interface Bucket {
    perMinute: number;
    tokens: number;
    refilledAt: number;
}
