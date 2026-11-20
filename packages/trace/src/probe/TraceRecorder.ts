import type { TraceHitGroup } from '../TraceLine.js';

/** Width of a time bucket: hits are deduplicated per bucket, label and file. */
export const TRACE_BUCKET_MS = 100;

/**
 * Collects hits between flushes, deduplicated per bucket, label and file. `record` is the hot path
 * — tens of thousands of calls per test — so a repeated hit costs two map lookups and nothing is
 * allocated for it.
 */
export class TraceRecorder {
    private bucket = -1;
    /** Groups of the current bucket not drained yet, by label. */
    private groups = new Map<string | null, TraceRecorderGroup>();
    private pending: TraceHitGroup[] = [];

    /** Records that `fileId` ran under `label` at wall-clock `now`. */
    record(fileId: number, label: string | null, now: number) {
        const bucket = Math.floor(now / TRACE_BUCKET_MS);
        if (bucket !== this.bucket) {
            this.bucket = bucket;
            this.groups = new Map();
        }

        let group = this.groups.get(label);
        if (group === undefined) {
            const fileIds: number[] = [];
            group = { seen: new Set(), fileIds };
            this.groups.set(label, group);
            this.pending.push([bucket, label, fileIds]);
        }

        if (!group.seen.has(fileId)) {
            group.seen.add(fileId);
            group.fileIds.push(fileId);
        }
    }

    /** Takes the groups recorded since the previous drain. */
    drain(): TraceHitGroup[] {
        const pending = this.pending;
        this.pending = [];
        this.groups = new Map();
        return pending;
    }
}

interface TraceRecorderGroup {
    seen: Set<number>;
    /** The array inside the pending group, filled in place. */
    fileIds: number[];
}
