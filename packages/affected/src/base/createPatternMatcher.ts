import path from 'node:path';

/**
 * The selection-pattern rule of `nzyme git affected`: a glob (`Bun.Glob`) without `/` matches the
 * basename (`*.test.ts`), one with `/` the root-relative path (`packages/{ui,app}/**\/*.stories.tsx`).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function createPatternMatcher(patterns: readonly string[]): (file: string) => boolean {
    const globs = patterns.map(pattern => ({ glob: new Bun.Glob(pattern), basename: !pattern.includes('/') }));
    return file => globs.some(({ glob, basename }) => glob.match(basename ? path.posix.basename(file) : file));
}
