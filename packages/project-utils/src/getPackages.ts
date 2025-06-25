import { findRoot } from '@manypkg/find-root';
import { DEFAULT_TOOLS } from '@manypkg/find-root';
import type { PackageJson } from 'pkg-types';

/**
 * A package in a monorepo.
 */
export interface Package {
    /**
     * The path to the package.
     */
    path: string;

    /**
     * The package.json content.
     */
    packageJson: PackageJson;
}

/**
 * Get all packages in a monorepo.
 * @param cwd - The current working directory to resolve from.
 * @returns The packages in the monorepo.
 * @__NO_SIDE_EFFECTS__
 */
export async function getPackages(cwd?: string): Promise<Package[]> {
    const dir = cwd ?? process.cwd();
    const monorepoRoot = await findRoot(dir);
    const tools = DEFAULT_TOOLS;
    const tool = tools.find(t => t.type === monorepoRoot.tool);
    if (!tool) {
        throw new Error(`Could not find ${monorepoRoot.tool} tool`);
    }

    const { packages } = await tool.getPackages(monorepoRoot.rootDir);

    return packages.map<Package>(p => ({
        path: p.dir,
        packageJson: p.packageJson,
    }));
}
