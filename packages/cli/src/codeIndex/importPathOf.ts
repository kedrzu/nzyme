import { relative, sep } from 'node:path';

/** Inputs for {@link importPathOf}. */
export interface ImportPathOfOptions {
    /** Owning workspace package name, e.g. '@acme/payments'. */
    packageName: string;
    /** Absolute path to the package root (the dir containing its package.json). */
    packageDir: string;
    /** Absolute path to the source file inside the package. */
    filePath: string;
}

/**
 * Produces the deep import specifier a consumer would write for a source file:
 * `<packageName>/<path-under-src>.js`. A leading `src/` segment is stripped (packages
 * export from their compiled `dist` mirror of `src`), `.ts`/`.tsx` becomes `.js` to match
 * the emitted module, and `.vue` is left as-is. Path separators are normalized to `/`
 * so the result is valid regardless of the host OS.
 * @__NO_SIDE_EFFECTS__
 */
export function importPathOf(options: ImportPathOfOptions): string {
    const { packageName, packageDir, filePath } = options;

    const rel = relative(packageDir, filePath).split(sep).join('/');
    const withoutSrc = rel.startsWith('src/') ? rel.slice('src/'.length) : rel;
    const withJsExt = withoutSrc.replace(/\.tsx?$/, '.js');

    return `${packageName}/${withJsExt}`;
}
