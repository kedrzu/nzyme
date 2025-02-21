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

    const esmTsconfigPath = path.join(cwd, './tsconfig.esm.dev.json');
    const esmReferences = await getTsReferences({
        path: esmTsconfigPath,
        dependencies: packages,
        fileName: 'tsconfig.esm.json',
    });
    await saveTsReferences(esmTsconfigPath, esmReferences, 'tsconfig.json');

    const cjsTsconfigPath = path.join(cwd, './tsconfig.cjs.dev.json');
    const cjsReferences = await getTsReferences({
        path: cjsTsconfigPath,
        dependencies: packages,
        fileName: 'tsconfig.cjs.json',
    });

    await saveTsReferences(cjsTsconfigPath, cjsReferences, 'tsconfig.json');

    for (const pkg of packages) {
        await processPackage({
            pkg,
            packages,
            fileName: 'tsconfig.esm.json',
        });

        await processPackage({
            pkg,
            packages,
            fileName: 'tsconfig.cjs.json',
        });
    }
}

async function processPackage(params: { pkg: Package; packages: Package[]; fileName: string }) {
    const tsconfig = await loadTsConfigForPackage(params.pkg, params.fileName);
    if (!tsconfig) {
        return;
    }

    const dependencyNames = [
        ...Object.keys(params.pkg.dependencies || {}),
        ...Object.keys(params.pkg.devDependencies || {}),
    ];

    const dependencies = dependencyNames
        .map(d => params.packages.find(p => p.name === d)!)
        .filter(Boolean);

    const references = await getTsReferences({
        path: tsconfig.path,
        dependencies: dependencies,
        fileName: params.fileName,
    });

    const configPath = path.join(params.pkg.location, getFileDevName(params.fileName));
    await saveTsReferences(configPath, references, params.fileName);
}

async function getTsReferences(params: {
    path: string;
    dependencies: Package[];
    fileName: string;
}) {
    const references: { path: string }[] = [];

    for (const dep of params.dependencies) {
        const depTsConfig = await loadTsConfigForPackage(dep, params.fileName);

        const disable =
            !depTsConfig ||
            !depTsConfig.resolved.compilerOptions ||
            !depTsConfig.resolved.compilerOptions.composite ||
            depTsConfig.resolved.compilerOptions.noEmit ||
            !(dep.get('main') || dep.get('exports') || dep.get('bin'));

        if (disable) {
            continue;
        }

        let relativePath = path.relative(path.dirname(params.path), depTsConfig.path);
        if (path.sep === '\\') {
            relativePath = relativePath.replace(/\\/g, '/');
        }

        if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
            relativePath = './' + relativePath;
        }

        if (relativePath.endsWith(params.fileName)) {
            relativePath =
                relativePath.slice(0, -params.fileName.length) + getFileDevName(params.fileName);
        }

        references.push({
            path: relativePath,
        });
    }

    return references;
}

async function loadTsConfigForPackage(pkg: Package, fileName: string) {
    const filePath = path.join(pkg.location, fileName);
    return await loadTsConfig(filePath);
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
    configPath: string,
    references: { path: string }[],
    fileName: string,
) {
    const config = {
        extends: `./${fileName}`,
        references,
    };

    let configJson = json.stringify(config, undefined, 2);

    const prettierConfig = await prettier.resolveConfig(configPath);
    configJson = await prettier.format(configJson, {
        ...prettierConfig,
        parser: 'json',
    });

    consola.success(configPath);
    await fs.writeFile(configPath, configJson, { encoding: 'utf8' });
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
