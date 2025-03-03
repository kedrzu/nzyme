import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { exists } from 'fs-extra';
import type { OutputBundle, Plugin } from 'rollup';
import type { PackageJson } from 'type-fest';

import { concatIterable } from '@nzyme/utils';

export type PackageJsonPluginOptions = {
    importMeta?: ImportMeta;
    packageJson?: PackageJson;
};

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

    function getPackageNameFromDependency(dep: string) {
        const regex = /^(@[^/]+\/)?([^/]+)(\/.*)?$/;
        const match = dep.match(regex);

        if (!match) {
            return null;
        }

        return match[1] ? `${match[1]}${match[2]}` : match[2];
    }

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

    async function readPackageJson(packageJsonPath: string) {
        const fileExists = await exists(packageJsonPath);
        if (!fileExists) {
            return null;
        }

        const packageJson = await fs.readFile(packageJsonPath, 'utf8');
        return JSON.parse(packageJson) as PackageJson;
    }
}
