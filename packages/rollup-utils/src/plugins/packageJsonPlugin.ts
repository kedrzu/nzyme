import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { exists } from 'fs-extra';
import type { OutputBundle, Plugin } from 'rollup';
import type { PackageJson } from 'type-fest';

import { concatIterable } from '@nzyme/utils';

/**
 * Configuration options for the package.json plugin.
 */
export type PackageJsonPluginOptions = {
    /**
     * The import.meta object for resolving module paths
     */
    importMeta?: ImportMeta;
    /**
     * Base package.json object to extend with dependencies
     */
    packageJson?: PackageJson;
};

/**
 * Creates a Rollup plugin that generates a package.json file with dependencies
 * from the bundle and local package.json. This plugin is useful for creating
 * self-contained bundles that include their dependencies.
 *
 * @param options - Configuration options for the plugin
 * @returns A Rollup plugin that generates package.json and yarn.lock files
 */
export function packageJsonPlugin(options: PackageJsonPluginOptions = {}): Plugin {
    const importMeta = options.importMeta ?? import.meta;
    const packageJson = options.packageJson ?? {};

    return {
        name: 'package-json',
        async generateBundle(_, bundle: OutputBundle) {
            const localPackageJsonPath = path.join(process.cwd(), 'package.json');
            const localPackageJson = await readPackageJson(localPackageJsonPath);

            const packages = [
                ...getPackagesFromBundle(bundle),
                ...Object.keys(localPackageJson?.dependencies ?? {}),
            ].sort();

            const packagesSet = new Set(packages);
            const dependencies = await getPackagesWithVersions(packagesSet);

            packageJson.dependencies = {
                ...packageJson.dependencies,
                ...dependencies,
            };

            this.emitFile({
                type: 'asset',
                fileName: 'package.json',
                source: JSON.stringify(packageJson, null, 2),
            });

            this.emitFile({
                type: 'asset',
                fileName: 'yarn.lock',
                source: '',
            });
        },
    };

    /**
     * Extracts package names from the Rollup bundle
     * @param bundle - The Rollup output bundle
     * @yields Package names found in the bundle
     */
    function* getPackagesFromBundle(bundle: OutputBundle) {
        for (const chunkName in bundle) {
            const chunk = bundle[chunkName];
            if (!chunk || chunk.type !== 'chunk') {
                continue;
            }

            for (const dep of concatIterable(chunk.imports, chunk.dynamicImports)) {
                const packageName = getPackageNameFromDependency(dep);
                if (packageName) {
                    yield packageName;
                }
            }
        }
    }

    /**
     * Extracts the package name from a dependency path
     * @param dep - The dependency path
     * @returns The package name or null if not a valid package path
     */
    function getPackageNameFromDependency(dep: string) {
        const regex = /^(@[^/]+\/)?([^/]+)(\/.*)?$/;
        const match = dep.match(regex);

        if (!match) {
            return null;
        }

        return match[1] ? `${match[1]}${match[2]}` : match[2];
    }

    /**
     * Gets the version for each package in the set
     * @param packages - Set of package names
     * @returns A record mapping package names to their versions
     */
    async function getPackagesWithVersions(packages: Iterable<string>) {
        const dependencies: Record<string, string> = {};

        for (const dep of packages) {
            const version = await getDependencyVersion(dep);
            if (version) {
                dependencies[dep] = version;
            }
        }

        return dependencies;
    }

    /**
     * Gets the version of a specific dependency
     * @param depName - The name of the dependency
     * @returns The version string or null if not found
     */
    async function getDependencyVersion(depName: string) {
        const modulePath = resolveModulePath(depName);
        if (!modulePath) {
            return null;
        }

        let depDir = path.dirname(modulePath);

        // Skip local packages
        if (!depDir.includes(`${path.sep}node_modules${path.sep}`)) {
            return null;
        }

        while (depDir && path.basename(depDir) !== 'node_modules') {
            const packageJsonPath = path.join(depDir, 'package.json');

            const packageJson = await readPackageJson(packageJsonPath);
            if (packageJson?.version) {
                return packageJson.version;
            }

            depDir = path.dirname(depDir);
        }

        return null;
    }

    /**
     * Resolves the path to a module
     * @param moduleName - The name of the module to resolve
     * @returns The resolved path or null if not found
     */
    function resolveModulePath(moduleName: string) {
        try {
            const url = importMeta.resolve(moduleName);
            if (url.startsWith('node:')) {
                return null;
            }

            return fileURLToPath(url);
        } catch {
            return null;
        }
    }

    /**
     * Reads and parses a package.json file
     * @param packageJsonPath - Path to the package.json file
     * @returns The parsed package.json object or null if not found
     */
    async function readPackageJson(packageJsonPath: string) {
        const fileExists = await exists(packageJsonPath);
        if (!fileExists) {
            return null;
        }

        const packageJson = await fs.readFile(packageJsonPath, 'utf8');
        return JSON.parse(packageJson) as PackageJson;
    }
}
