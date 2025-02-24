import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import type { Package } from '@lerna/package';
import { getPackages } from '@lerna/project';
import { Command } from '@oclif/core';
import * as json from 'comment-json';
import fsExtra from 'fs-extra/esm';
import merge from 'lodash.merge';
import prettier from 'prettier';
import consola from 'consola';
import { asArray, createPromise } from '@nzyme/utils';

interface TsConfig {
    path: string;
    config: Record<string, any>;
    resolved: Record<string, any>;
}

interface PackageCache {
    esm: string | null;
    cjs: string | null;
}

const tsConfigsCache = new Map<string, TsConfig | null>();
const packageCache = new Map<string, Promise<PackageCache>>();

export class MonorepoCommand extends Command {
    async run() {
        await processProject();
    }
}

async function processProject() {
    const cwd = process.cwd();
    const packages = await loadPackages(cwd);

    const tsconfigPath = path.join(cwd, './tsconfig.json');

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
        fileName: 'tsconfig.esm.json',
        extends: tsconfigPath,
        references: esmReferences,
    });

    await saveTsReferences({
        cwd,
        fileName: 'tsconfig.cjs.json',
        extends: tsconfigPath,
        references: cjsReferences,
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
    if (tsconfig.esm && isMonorepoPackage(pkg, tsconfig.esm)) {
        esmResult = await saveTsReferences({
            cwd: pkg.location,
            fileName: 'tsconfig.esm.json',
            extends: tsconfig.esm.path,
            references: esmReferences,
        });
    }

    if (tsconfig.cjs && isMonorepoPackage(pkg, tsconfig.cjs)) {
        cjsResult = await saveTsReferences({
            cwd: pkg.location,
            fileName: 'tsconfig.cjs.json',
            extends: tsconfig.cjs.path,
            references: cjsReferences,
        });
    }

    return {
        esm: esmResult,
        cjs: cjsResult,
    };
}

async function loadTsConfigForPackage(pkg: Package) {
    const cjsConfig = await loadTsConfig(path.join(pkg.location, 'tsconfig.cjs.json'));
    const esmConfig =
        (await loadTsConfig(path.join(pkg.location, 'tsconfig.esm.json'))) ||
        (await loadTsConfig(path.join(pkg.location, 'tsconfig.json')));

    return {
        cjs: cjsConfig,
        esm: esmConfig,
    };
}

function isMonorepoPackage(pkg: Package, tsconfig: TsConfig | null): tsconfig is TsConfig {
    return (
        !!tsconfig &&
        !!tsconfig.resolved.compilerOptions &&
        !!tsconfig.resolved.compilerOptions.composite &&
        !tsconfig.resolved.compilerOptions.noEmit &&
        (pkg.get('main') || pkg.get('exports') || pkg.get('bin'))
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
        let configPath = filePath;

        const extend: string[] = [];

        const config = json.parse(configFile) as Record<string, any>;
        let resolved = json.parse(configFile) as Record<string, any>;

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

            const extendedConfig = json.parse(configFile) as Record<string, any>;
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
}) {
    const prettierConfig = await prettier.resolveConfig(params.cwd);
    const outputPath = getNzymePath(params.cwd, params.fileName);
    const extendsPath = getRelativePath(outputPath, params.extends);
    const tsconfig = {
        extends: extendsPath,
        references: params.references.map(r => {
            return {
                path: getRelativePath(outputPath, r),
            };
        }),
    };

    let configJson = json.stringify(tsconfig, undefined, 2);
    configJson = await prettier.format(configJson, {
        ...prettierConfig,
        parser: 'json',
    });

    await fsExtra.outputFile(outputPath, configJson, { encoding: 'utf8' });
    consola.success(outputPath);

    return outputPath;
}

function getNzymePath(cwd: string, relativePath?: string) {
    const nzymeDir = path.join(cwd, '.nzyme');
    if (!relativePath) {
        return nzymeDir;
    }

    return path.resolve(nzymeDir, relativePath);
}

async function loadPackages(cwd: string) {
    const packages = await getPackages(cwd);
    return packages.filter(
        p => p.get('main') || p.get('exports') || p.get('bin') || p.get('module') || p.get('types'),
    );
}
