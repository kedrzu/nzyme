import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import type { Package } from '@lerna/package';
import { getPackages } from '@lerna/project';
import * as json from 'comment-json';
import { consola } from 'consola';
import fsExtra from 'fs-extra/esm';
import merge from 'lodash.merge';
import { format as prettierFormat, resolveConfig as prettierResolveConfig } from 'prettier';
import type { TsConfigJson } from 'type-fest';

import { asArray } from '@nzyme/utils';

import type { NzymePackageConfig } from '../NzymePackageConfig.js';
import { defineCommand } from '../defineCommand.js';

interface TsConfig {
    path: string;
    config: TsConfigJson;
    resolved: TsConfigJson;
}

interface PackageCache {
    esm: string | null;
    cjs: string | null;
}

const tsConfigsCache = new Map<string, TsConfig | null>();
const packageCache = new Map<string, Promise<PackageCache>>();

export const MonorepoCommand = defineCommand({
    path: 'monorepo',
    execute: async () => {
        await processProject();
    },
});

async function processProject() {
    const cwd = process.cwd();
    const packages = await getPackages(cwd);

    const tsconfigPath = path.join(cwd, './tsconfig.esm.json');

    const esmReferences: string[] = [];
    const cjsReferences: string[] = [];

    for (const pkg of packages) {
        const result = await processPackage(pkg, packages);
        if (result.esm) {
            esmReferences.push(result.esm);
        }

        if (result.cjs) {
            cjsReferences.push(result.cjs);
        }
    }

    await saveTsReferences({
        cwd,
        fileName: 'tsconfig.json',
        extends: tsconfigPath,
        references: esmReferences,
        config: {
            include: [],
        },
    });

    await saveTsReferences({
        cwd,
        fileName: 'tsconfig.cjs.json',
        extends: tsconfigPath,
        references: cjsReferences,
        config: {
            include: [],
        },
    });
}

async function processPackage(pkg: Package, packages: Package[]): Promise<PackageCache> {
    const existing = packageCache.get(pkg.name);
    if (existing) {
        return await existing;
    }

    const result = processPackageCore(pkg, packages);
    packageCache.set(pkg.name, result);

    return await result;
}

async function processPackageCore(pkg: Package, packages: Package[]): Promise<PackageCache> {
    const dependencyNames = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
    ];

    const dependencies = dependencyNames
        .map(d => packages.find(p => p.name === d)!)
        .filter(Boolean);

    const esmReferences: string[] = [];
    const cjsReferences: string[] = [];

    for (const dep of dependencies) {
        const depResult = await processPackage(dep, packages);
        if (depResult.esm) {
            esmReferences.push(depResult.esm);
        }

        if (depResult.cjs) {
            cjsReferences.push(depResult.cjs);
        }
    }

    let esmResult: string | null = null;
    let cjsResult: string | null = null;

    const tsconfig = await loadTsConfigForPackage(pkg);
    if (!tsconfig) {
        return {
            esm: null,
            cjs: null,
        };
    }

    const isComposite = isCompositePackage(tsconfig);

    esmResult = await saveTsReferences({
        cwd: pkg.location,
        fileName: 'tsconfig.json',
        extends: tsconfig.path,
        references: esmReferences,
        config: {
            compilerOptions: {
                tsBuildInfoFile:
                    tsconfig.config.compilerOptions?.tsBuildInfoFile ?? 'tsconfig.esm.tsbuildinfo',
            },
        },
    });

    const config = getNzymeConfig(pkg);
    if (config?.cjs) {
        let dist = tsconfig.config.compilerOptions?.outDir ?? './dist';
        if (dist.endsWith('/')) {
            dist = dist.slice(0, -1);
        }

        cjsResult = await saveTsReferences({
            cwd: pkg.location,
            fileName: 'tsconfig.cjs.json',
            extends: tsconfig.path,
            references: cjsReferences,
            config: {
                compilerOptions: {
                    module: 'CommonJS',
                    moduleResolution: 'Node',
                    outDir: `${dist}-cjs`,
                    tsBuildInfoFile: 'tsconfig.cjs.tsbuildinfo',
                },
            },
        });
    }

    return {
        esm: isComposite ? esmResult : null,
        cjs: isComposite ? cjsResult : null,
    };
}

async function loadTsConfigForPackage(pkg: Package) {
    return await loadTsConfig(path.join(pkg.location, 'tsconfig.esm.json'));
}

function isCompositePackage(tsconfig: TsConfig | null): tsconfig is TsConfig {
    return (
        !!tsconfig &&
        !!tsconfig.resolved.compilerOptions &&
        !!tsconfig.resolved.compilerOptions.composite &&
        !tsconfig.resolved.compilerOptions.noEmit
    );
}

function getRelativePath(fromPath: string, toPath: string) {
    let relativePath = path.relative(path.dirname(fromPath), toPath);
    if (path.sep === '\\') {
        relativePath = relativePath.replace(/\\/g, '/');
    }

    if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
        relativePath = './' + relativePath;
    }

    return relativePath;
}

async function loadTsConfig(filePath: string) {
    let tsConfig = tsConfigsCache.get(filePath);
    if (!tsConfig) {
        tsConfig = await loadTsConfigCore(filePath);
        tsConfigsCache.set(filePath, tsConfig);
    }

    return tsConfig;
}

async function loadTsConfigCore(filePath: string) {
    try {
        if (!(await fsExtra.pathExists(filePath))) {
            return null;
        }

        let configFile = await fs.readFile(filePath, { encoding: 'utf8' });
        const configPath = filePath;

        const extend: string[] = [];

        const config = json.parse(configFile) as TsConfigJson;
        let resolved = json.parse(configFile) as TsConfigJson;

        if (resolved.extends) {
            const cwd = path.dirname(configPath);
            const extendsPaths = asArray(resolved.extends).map(p => resolveTsConfigPath(cwd, p));
            extend.push(...extendsPaths);
        }

        while (extend.length > 0) {
            const extendsPath = extend.shift();
            if (!extendsPath) {
                break;
            }

            configFile = await fs.readFile(extendsPath, { encoding: 'utf8' });

            const extendedConfig = json.parse(configFile) as TsConfigJson;
            if (extendedConfig.extends) {
                const cwd = path.dirname(extendsPath);
                const extendsPaths = asArray(extendedConfig.extends).map(p =>
                    resolveTsConfigPath(cwd, p),
                );
                extend.push(...extendsPaths);
            }

            resolved = merge(extendedConfig, resolved);
        }

        delete resolved.extends;

        const result: TsConfig = {
            path: filePath,
            config,
            resolved,
        };

        return result;
    } catch (error: unknown) {
        if (error instanceof Error) {
            throw new Error(`Failed to process ${filePath}: ${error.message}`, { cause: error });
        }

        throw new Error(`Failed to process ${filePath}`, { cause: error });
    }
}

function resolveTsConfigPath(cwd: string, filePath: string) {
    if (filePath.startsWith('.')) {
        return path.resolve(cwd, filePath);
    }

    return fileURLToPath(import.meta.resolve(filePath));
}

async function saveTsReferences(params: {
    cwd: string;
    fileName: string;
    extends: string;
    references: string[];
    config?: TsConfigJson;
}) {
    const prettierConfig = await prettierResolveConfig(params.cwd);
    const outputPath = path.join(params.cwd, params.fileName);
    const extendsPath = getRelativePath(outputPath, params.extends);
    const tsconfig = {
        ...params.config,
        extends: extendsPath,
        references: params.references.map(r => {
            return {
                path: getRelativePath(outputPath, r),
            };
        }),
    };

    let configJson = json.stringify(tsconfig, undefined, 2);
    configJson = await prettierFormat(configJson, {
        ...prettierConfig,
        parser: 'json',
    });

    await fsExtra.outputFile(outputPath, configJson, { encoding: 'utf8' });
    consola.success(outputPath);

    return outputPath;
}

function getNzymeConfig(pkg: Package) {
    return pkg.get('nzyme') as NzymePackageConfig | undefined | null;
}
