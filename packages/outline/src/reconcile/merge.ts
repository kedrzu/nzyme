import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The three versions of one document file, all in local form (frontmatter, `# ` title, local links). */
export interface MergeDocumentParams {
    /** The local file now. */
    ours: string;
    /** What both sides last agreed on: `base/<id>.md`. */
    base: string;
    /** Outline's current content. */
    theirs: string;
    /** Who saved Outline's current revision; names the Outline side in conflict markers. */
    theirsAuthor: string;
}

export interface MergeDocumentResult {
    /** The merged file; with conflict markers when `conflict`. */
    content: string;
    conflict: boolean;
}

const OURS_LABEL = 'lokalnie';
const BASE_LABEL = 'wspólna';

/**
 * A 3-way merge of a document by `git merge-file`: changes to different paragraphs combine, changes to the same
 * one leave conflict markers (`<<<<<<< lokalnie` … `>>>>>>> Outline (<name>)`) for the agent to resolve.
 */
export async function mergeDocument(params: MergeDocumentParams): Promise<MergeDocumentResult> {
    const dir = await mkdtemp(join(tmpdir(), 'outline-merge-'));
    try {
        const ours = join(dir, 'ours.md');
        const base = join(dir, 'base.md');
        const theirs = join(dir, 'theirs.md');
        await writeFile(ours, params.ours);
        await writeFile(base, params.base);
        await writeFile(theirs, params.theirs);
        const child = Bun.spawn(
            [
                'git',
                'merge-file',
                '-p',
                '-L',
                OURS_LABEL,
                '-L',
                BASE_LABEL,
                '-L',
                `Outline (${params.theirsAuthor})`,
                ours,
                base,
                theirs,
            ],
            { stdout: 'pipe', stderr: 'pipe' },
        );
        const [content, error, exitCode] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
        ]);
        // Exit code: 0 clean, 1–127 the number of conflicts, anything else a failure.
        if (exitCode > 127) {
            throw new Error(`git merge-file failed (${exitCode}): ${error.trim()}`);
        }
        return { content, conflict: exitCode > 0 };
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

/**
 * Whether a file still has the conflict markers `mergeDocument` writes: the opening and the closing line.
 * @__NO_SIDE_EFFECTS__
 */
export function hasConflictMarkers(content: string): boolean {
    return /^<{7} /m.test(content) && /^>{7} /m.test(content);
}
