/**
 * The number of `/`-separated segments in `path`.
 * @util
 */
export function pathDepth(path: string): number {
    return path.split('/').length;
}
