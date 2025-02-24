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
import { asArray } from '@nzyme/utils';

interface TsConfig {
    path: string;
    config: Record<string, any>;
    resolved: Record<string, any>;
}

const tsConfigsCache = new Map<string, TsConfig | null>();

export class MonorepoCommand extends Command {
    async run() {
        await processProject();
    }
}

async function processProject() {
    const cwd = process.cwd();
    const packages = await loadPackages(cwd);
    const references = await getTsReferences(cwd, packages);

    const esmTsconfigPath = path.join(cwd, './tsconfig.esm.dev.json');

    await saveTsReferences(esmTsconfigPath, {
        extends: './tsconfig.json',
        references: references.esm,
    });

    const cjsTsconfigPath = path.join(cwd, './tsconfig.cjs.dev.json');

    await saveTsReferences(cjsTsconfigPath, {
        extends: './tsconfig.json',
        references: references.cjs,
    });

    for (const pkg of packages) {
        await processPackage(pkg, packages);
    }
}

async function processPackage(pkg: Package, packages: Package[]) {
    const dependencyNames = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
    ];

    const dependencies = dependencyNames
        .map(d => packages.find(p => p.name === d)!)
        .filter(Boolean);

    const references = await getTsReferences(pkg.location, dependencies);
    const tsconfig = await loadTsConfigForPackage(pkg);

    if (tsconfig.esm && isMonorepoPackage(pkg, tsconfig.esm)) {
        const filePath = getFileDevName(tsconfig.esm.path);
        const extendsPath = getRelativePath(path.dirname(filePath), tsconfig.esm.path);

        await saveTsReferences(filePath, {
            extends: extendsPath,
            references: references.esm,
        });
    }

    if (tsconfig.cjs && isMonorepoPackage(pkg, tsconfig.cjs)) {
        const filePath = getFileDevName(tsconfig.cjs.path);
        const extendsPath = getRelativePath(path.dirname(filePath), tsconfig.cjs.path);

        await saveTsReferences(filePath, {
            extends: extendsPath,
            references: references.cjs,
        });
    }
}

async function getTsReferences(cwd: string, dependencies: Package[]) {
    const esmReferences: { path: string }[] = [];
    const cjsReferences: { path: string }[] = [];

    for (const dep of dependencies) {
        const depTsConfig = await loadTsConfigForPackage(dep);

        if (isMonorepoPackage(dep, depTsConfig.esm)) {
            esmReferences.push(getTsReference(cwd, depTsConfig.esm));
        }

        if (isMonorepoPackage(dep, depTsConfig.cjs)) {
            cjsReferences.push(getTsReference(cwd, depTsConfig.cjs));
        }
    }

    return {
        esm: esmReferences,
        cjs: cjsReferences,
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

function getTsReference(fromPath: string, tsconfig: TsConfig) {
    const relativePath = getRelativePath(fromPath, tsconfig.path);
    const devPath = getFileDevName(relativePath);

    return {
        path: devPath,
    };
}

function getRelativePath(fromPath: string, toPath: string) {
    let relativePath = path.relative(fromPath, toPath);
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

async function saveTsReferences(
    filePath: string,
    config: { extends: string; references: { path: string }[] },
) {
    const prettierConfig = await prettier.resolveConfig(filePath);

    let configJson = json.stringify(config, undefined, 2);
    configJson = await prettier.format(configJson, {
        ...prettierConfig,
        parser: 'json',
    });

    consola.success(filePath);
    await fs.writeFile(filePath, configJson, { encoding: 'utf8' });
}

function getFileDevName(fileName: string) {
    return fileName.endsWith('.json') ? fileName.slice(0, -5) + '.dev.json' : fileName + '.dev';
}

async function loadPackages(cwd: string) {
    const packages = await getPackages(cwd);
    return packages.filter(
        p => p.get('main') || p.get('exports') || p.get('bin') || p.get('module') || p.get('types'),
    );
}
