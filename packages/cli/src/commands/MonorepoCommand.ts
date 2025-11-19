import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';
import { watch } from 'chokidar';
import { Option } from 'clipanion';
import * as json from 'comment-json';
import fsExtra from 'fs-extra/esm';
import merge from 'lodash.merge';
import type { TsConfigJson } from 'type-fest';

import type { Package } from '@nzyme/project-utils';
import { getPackages, getProjectRoot, isFileIgnored, saveFile } from '@nzyme/project-utils';
import { asArray, debounceAsyncFunction } from '@nzyme/utils';

import { Command } from '../Command.js';
import type { NzymePackageConfig } from '../NzymePackageConfig.js';

interface TsConfig {
    path: string;
    config: TsConfigJson;
    resolved: TsConfigJson;
}

interface PackageCache {
    esm: string | null;
    cjs: string | null;
}

const PACKAGE_JSON_REGEX = /\/?package\.json$/;

/**
 * Command to process the monorepo and generate tsconfig.json files for each package
 */
export class MonorepoCommand extends Command {
    static override paths = [['monorepo']];

    static override usage = Command.Usage({
        category: 'Monorepo',
        description: 'Process the monorepo and generate tsconfig.json files for each package',
    });

    watch = Option.Boolean('--watch,-w', {
        description: 'Watch for changes',
    });

    cwd = process.cwd();

    private tsConfigsCache = new Map<string, TsConfig | null>();
    private packageCache = new Map<string, Promise<PackageCache>>();
    private projectRoot = getProjectRoot();

    /**
     * Execute the command.
     */
    override async run() {
        await this.processProject(true);

        if (this.watch) {
            this.startWatcher();
        }
    }

    private startWatcher() {
        const watcher = watch('.', {
            cwd: this.cwd,
            ignored: file => {
                const ignored = isFileIgnored(file);
                if (ignored === false) {
                    // It is a non-ignored file, so we need to check if it matches the PACKAGE_JSON_REGEX
                    return !PACKAGE_JSON_REGEX.test(file);
                }

                return !!ignored;
            },
            ignoreInitial: true,
            persistent: true,
        });

        this.logger.info('Watching for changes...');

        const onFileChange = debounceAsyncFunction(this.onFileChange.bind(this), {
            trailing: true,
        });

        watcher.on('add', file => void onFileChange(file));
        watcher.on('change', file => void onFileChange(file));
        watcher.on('unlink', file => void onFileChange(file));
    }

    private async onFileChange(file: string) {
        if (!PACKAGE_JSON_REGEX.test(file)) {
            return;
        }

        // Invalidate cache for the package whose package.json was changed
        await this.invalidateCacheForChangedPackage(file);
        await this.processProject(false);
    }

    private async invalidateCacheForChangedPackage(packageJsonPath: string) {
        try {
            const packages = await getPackages(this.cwd);
            const packageDir = path.dirname(path.resolve(this.cwd, packageJsonPath));

            // Find the package that corresponds to the changed package.json
            const changedPackage = packages.find(pkg => path.resolve(pkg.path) === packageDir);

            if (changedPackage?.packageJson.name) {
                // Clear the package cache for this specific package
                this.packageCache.delete(changedPackage.packageJson.name);

                // Also clear any tsconfig cache for this package directory
                const tsconfigPath = path.join(changedPackage.path, 'tsconfig.esm.json');
                this.tsConfigsCache.delete(tsconfigPath);
            }
        } catch (error) {
            this.logger.error('Failed to invalidate cache for changed package', { error });
        }
    }

    private async processProject(throwOnError: boolean) {
        try {
            const cwd = process.cwd();
            const packages = await getPackages(cwd);

            const tsconfigPath = path.join(cwd, './tsconfig.esm.json');

            const esmReferences: string[] = [];
            const cjsReferences: string[] = [];

            for (const pkg of packages) {
                const result = await this.processPackage(pkg, packages, throwOnError);
                if (result.esm) {
                    esmReferences.push(result.esm);
                }

                if (result.cjs) {
                    cjsReferences.push(result.cjs);
                }
            }

            await this.saveTsReferences({
                cwd,
                fileName: 'tsconfig.json',
                extends: tsconfigPath,
                references: esmReferences,
                config: {
                    include: [],
                },
            });

            await this.saveTsReferences({
                cwd,
                fileName: 'tsconfig.cjs.json',
                extends: tsconfigPath,
                references: cjsReferences,
                config: {
                    include: [],
                },
            });
        } catch (error: unknown) {
            if (throwOnError) {
                throw error;
            }

            this.logger.error(`Failed to process project`, { error });
        }
    }

    private async processPackage(pkg: Package, packages: Package[], throwOnError: boolean): Promise<PackageCache> {
        if (!pkg.packageJson.name) {
            const relativePath = path.relative(this.projectRoot, pkg.path);
            this.logger.error(`Package is missing a name: ${relativePath}`);
            return { esm: null, cjs: null };
        }
        const existing = this.packageCache.get(pkg.packageJson.name);
        if (existing) {
            return await existing;
        }

        try {
            const result = this.processPackageCore(pkg, packages, throwOnError);
            this.packageCache.set(pkg.packageJson.name, result);

            return await result;
        } catch (error: unknown) {
            if (throwOnError) {
                throw error;
            }

            this.logger.error(`Failed to process package ${pkg.packageJson.name}`, { error });
            this.packageCache.set(pkg.packageJson.name, Promise.resolve({ esm: null, cjs: null }));
            return { esm: null, cjs: null };
        }
    }

    private async processPackageCore(pkg: Package, packages: Package[], throwOnError: boolean): Promise<PackageCache> {
        const dependencyNames = [
            ...Object.keys(pkg.packageJson.dependencies || {}),
            ...Object.keys(pkg.packageJson.devDependencies || {}),
        ];
        const dependencies = dependencyNames.map(d => packages.find(p => p.packageJson.name === d)!).filter(Boolean);

        const esmReferences: string[] = [];
        const cjsReferences: string[] = [];

        for (const dep of dependencies) {
            const depResult = await this.processPackage(dep, packages, throwOnError);
            if (depResult.esm) {
                esmReferences.push(depResult.esm);
            }

            if (depResult.cjs) {
                cjsReferences.push(depResult.cjs);
            }
        }

        let esmResult: string | null = null;
        let cjsResult: string | null = null;

        const tsconfig = await this.loadTsConfigForPackage(pkg);
        if (!tsconfig) {
            return {
                esm: null,
                cjs: null,
            };
        }

        const isComposite = isCompositePackage(tsconfig);

        esmResult = await this.saveTsReferences({
            cwd: pkg.path,
            fileName: 'tsconfig.json',
            extends: tsconfig.path,
            references: esmReferences,
            config: {
                compilerOptions: {
                    tsBuildInfoFile: tsconfig.config.compilerOptions?.tsBuildInfoFile ?? 'tsconfig.esm.tsbuildinfo',
                },
            },
        });

        const config = getNzymeConfig(pkg);
        if (config?.cjs) {
            let dist = tsconfig.config.compilerOptions?.outDir ?? './dist';
            if (dist.endsWith('/')) {
                dist = dist.slice(0, -1);
            }

            cjsResult = await this.saveTsReferences({
                cwd: pkg.path,
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

    private async loadTsConfigForPackage(pkg: Package) {
        return await this.loadTsConfig(path.join(pkg.path, 'tsconfig.esm.json'));
    }

    private async loadTsConfig(filePath: string) {
        let tsConfig = this.tsConfigsCache.get(filePath);
        if (!tsConfig) {
            tsConfig = await loadTsConfigCore(filePath);
            this.tsConfigsCache.set(filePath, tsConfig);
        }

        return tsConfig;
    }

    private async saveTsReferences(params: {
        config?: TsConfigJson;
        cwd: string;
        extends: string;
        fileName: string;
        references: string[];
    }) {
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

        const configJson = json.stringify(tsconfig, undefined, 2);
        await saveFile(outputPath, configJson);

        const relativePath = path.relative(this.projectRoot, outputPath);
        this.logger.info(`Generated ${chalk.green(relativePath)}`);

        return outputPath;
    }
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

            if (!(await fsExtra.pathExists(extendsPath))) {
                break;
            }

            configFile = await fs.readFile(extendsPath, { encoding: 'utf8' });

            const extendedConfig = json.parse(configFile) as TsConfigJson;
            if (extendedConfig.extends) {
                const cwd = path.dirname(extendsPath);
                const extendsPaths = asArray(extendedConfig.extends).map(p => resolveTsConfigPath(cwd, p));
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

function getNzymeConfig(pkg: Package) {
    return pkg.packageJson['nzyme'] as NzymePackageConfig | null | undefined;
}
