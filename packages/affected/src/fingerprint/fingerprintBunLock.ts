import { getMd5Hash } from '@nzyme/crypto';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/**
 * Fingerprints what a `bun.lock` installs from outside the workspace, or returns `null` when
 * `content` is not a `bun.lock` text. Test selection compares a `bun.lock` by this fingerprint,
 * and an install stamp built from it changes exactly when the installed external code may have.
 *
 * Dropped, because the workspace packages' own `package.json` files carry the same facts and
 * selection already follows each of them:
 * - `workspaces` — each workspace package's name, version, `bin` and dependency ranges;
 * - the entries of `packages` resolved to `workspace:`, which name a workspace package's path.
 *
 * Everything else counts, a top-level key a later lockfile format adds included: the external
 * entries of `packages` (resolved version, dependencies, integrity), `overrides`,
 * `patchedDependencies` (which patch applies to which package; the patch files themselves are
 * separate inputs), `trustedDependencies` (whose lifecycle scripts run), `catalog`/`catalogs`,
 * `lockfileVersion` and `configVersion` (bun's install defaults, such as the linker).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function fingerprintBunLock(content: string): string | null {
    let lock: unknown;
    try {
        lock = Bun.JSONC.parse(content);
    } catch {
        return null;
    }
    if (!isPlainObject(lock)) {
        return null;
    }
    const { packages, ...rest } = lock;
    if (!isPlainObject(packages)) {
        return null;
    }

    delete rest.workspaces;
    const external = Object.fromEntries(Object.entries(packages).filter(([, entry]) => !isWorkspaceEntry(entry)));
    return getMd5Hash(JSON.stringify({ ...rest, packages: external }));
}

/** Whether a `packages` entry resolves to a workspace package: `["@acme/app@workspace:packages/app"]`. */
function isWorkspaceEntry(entry: unknown): boolean {
    return Array.isArray(entry) && typeof entry[0] === 'string' && /^(?:@[^@/]+\/)?[^@]+@workspace:/.test(entry[0]);
}
