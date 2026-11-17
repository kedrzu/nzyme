import { getPackages } from '@nzyme/project-utils/getPackages.js';
import { buildImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';
import { relativePosixPath } from '@nzyme/project-utils/relativePosixPath.js';
import { resolveAffectedBase } from '@nzyme/project-utils/resolveAffectedBase.js';
import type { AffectedBase, AffectedBaseEnv } from '@nzyme/project-utils/resolveAffectedBase.js';

import type { AffectedConfig } from './AffectedConfig.js';
import { collectChangedFiles } from './collectChangedFiles.js';
import type { ChangedFile } from './collectChangedFiles.js';
import { rewriteChangedPath } from './rewriteChangedPath.js';
import { selectAffectedFiles } from './selectAffectedFiles.js';
import type { AffectedSelection } from './selectAffectedFiles.js';

/** Options of {@link selectAffectedSinceBase}. */
export interface SelectAffectedSinceBaseOptions {
    /** Top of the git working tree. */
    root: string;
    config: AffectedConfig;
    /** Selection globs, see `SelectAffectedFilesOptions.patterns`. */
    patterns: string[];
    /** An explicit base ref; otherwise resolved from `env` and `config.baseBranches`. */
    base?: string | undefined;
    env: AffectedBaseEnv;
}

/** What {@link selectAffectedSinceBase} measured and selected. */
export interface AffectedSinceBase {
    base: AffectedBase;
    changedFiles: ChangedFile[];
    selection: AffectedSelection;
    /** Root-relative directories of the workspace packages; `''` is never one. */
    packageDirs: string[];
}

/**
 * The whole base-diff selection of `nzyme git affected`: resolves the base, diffs the working tree
 * against it, scans the import graph once and selects the affected files matching `patterns`.
 */
export async function selectAffectedSinceBase(options: SelectAffectedSinceBaseOptions): Promise<AffectedSinceBase> {
    const { root, config } = options;
    const packages = await getPackages(root);
    const base = await resolveAffectedBase({
        root,
        base: options.base,
        env: options.env,
        baseBranches: config.baseBranches,
    });
    const changedFiles = await collectChangedFiles({ root, mergeBase: base.mergeBase });
    const graph = await buildImportGraph({
        root,
        packages,
        aliases: config.aliases,
        // Deleted files and rewrite targets (a gitignored `x.loc.ts`) are not walked, yet their importers count.
        extraPaths: changedFiles.flatMap(file => [
            ...(file.deleted ? [file.path] : []),
            ...rewriteChangedPath(file.path, config.rewrites),
        ]),
    });

    const packageDirs = packages
        .map(pkg => relativePosixPath(root, pkg.path))
        .filter(dir => dir !== '' && !dir.startsWith('..'));
    const selection = selectAffectedFiles({ graph, changedFiles, config, patterns: options.patterns, packageDirs });

    return { base, changedFiles, selection, packageDirs };
}
