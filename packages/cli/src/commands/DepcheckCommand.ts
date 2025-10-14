import chalk from 'chalk';
import { compareVersions } from 'compare-versions';
import depcheckImport from 'depcheck';
import enquirer from 'enquirer';
import latestVersion from 'latest-version';

import type { Package } from '@nzyme/project-utils';
import { getPackages } from '@nzyme/project-utils';
import { saveFile } from '@nzyme/project-utils';

import { Command } from '../Command.js';
import { Option } from '../index.js';

/**
 * Interface for depcheck configuration in package.json
 */
interface DepcheckConfig {
    ignoreDeps?: string[];
    ignoreFiles?: string[];
}

/**
 * Command to check and manage package dependencies
 */
export class DepcheckCommand extends Command {
    static override paths = [['depcheck']];

    static override usage = Command.Usage({
        category: 'Depcheck',
        description: 'Check and manage package dependencies',
    });

    fix = Option.Boolean('--fix,-f', {
        description: 'Fix the dependencies',
    });

    interactive = Option.Boolean('--interactive,-i', {
        description: 'Interactively choose what to do with each dependency',
    });

    /**
     *
     */
    override async run() {
        const cwd = process.cwd();
        const packages = await getPackages(cwd);

        const deps: Record<string, string> = {};
        for (const pkg of packages) {
            const { dependencies } = pkg.packageJson;
            if (dependencies) {
                for (const dep in dependencies) {
                    const version = dependencies[dep]!;
                    if (!deps[dep]) {
                        deps[dep] = version;
                        continue;
                    }

                    if (version === '*' || deps[dep] === '*') {
                        continue;
                    }

                    if (version.startsWith('workspace:') || deps[dep].startsWith('workspace:')) {
                        continue;
                    }

                    if (compareVersions(version, deps[dep])) {
                        deps[dep] = version;
                        continue;
                    }
                }
            }
        }

        packages.sort((a, b) => a.packageJson.name?.localeCompare(b.packageJson.name ?? '') ?? 0);

        if (this.interactive) {
            // Process packages sequentially in interactive mode to avoid conflicting prompts
            for (const pkg of packages) {
                await this.processPackage(pkg, deps);
            }
        } else {
            // Process packages in parallel for non-interactive modes
            const promises = packages.map(p => this.processPackage(p, deps));
            await Promise.all(promises);
        }
    }

    private async processPackage(pkg: Package, deps: Record<string, string>) {
        const pkgConfig = this.getOptions(pkg);
        const result = await depcheckImport(pkg.path, pkgConfig);
        const toWrite: string[] = [];
        let hasChanges = false;

        // Display package header in interactive mode
        if (
            this.interactive &&
            (result.dependencies.length || result.devDependencies.length || Object.keys(result.missing).length)
        ) {
            const packageName = chalk.underline(chalk.magenta(pkg.packageJson.name));
            const packagePath = chalk.dim(`(${pkg.path}/package.json)`);
            this.logger.info(`\n📦 Processing ${packageName} ${packagePath}`);
        }

        let dependencies = pkg.packageJson.dependencies;
        if (!dependencies) {
            dependencies = {};
            pkg.packageJson.dependencies = dependencies;
        }

        let devDependencies = pkg.packageJson.devDependencies;
        if (!devDependencies) {
            devDependencies = {};
            pkg.packageJson.devDependencies = devDependencies;
        }

        if (result.dependencies.length) {
            toWrite.push(`\n  🗑️  Unused dependencies:`);
            for (const dep of result.dependencies) {
                if (this.fix) {
                    delete dependencies[dep];
                    toWrite.push(`  ${chalk.green('✅ ' + dep)} (removed)`);
                    hasChanges = true;
                } else if (this.interactive) {
                    const action = await this.promptAction(dep, 'unused', false);
                    if (action === 'remove') {
                        delete dependencies[dep];
                        toWrite.push(`  ${chalk.green('✅ ' + dep)} (removed)`);
                        hasChanges = true;
                    } else {
                        toWrite.push(`  ${chalk.yellow('⏭️  ' + dep)} (skipped)`);
                    }
                } else {
                    toWrite.push(`  ${chalk.yellow('❓ ' + dep)}`);
                }
            }
        }

        if (result.devDependencies.length) {
            toWrite.push(`\n  🗑️  Unused dev dependencies:`);
            for (const dep of result.devDependencies) {
                if (this.fix) {
                    delete devDependencies[dep];
                    toWrite.push(`  ${chalk.green('✅ ' + dep)} (removed)`);
                    hasChanges = true;
                } else if (this.interactive) {
                    const action = await this.promptAction(dep, 'unused', true);
                    if (action === 'remove') {
                        delete devDependencies[dep];
                        toWrite.push(`  ${chalk.green('✅ ' + dep)} (removed)`);
                        hasChanges = true;
                    } else {
                        toWrite.push(`  ${chalk.yellow('⏭️  ' + dep)} (skipped)`);
                    }
                } else {
                    toWrite.push(`  ${chalk.yellow('❓ ' + dep)}`);
                }
            }
        }

        if (Object.keys(result.missing).length) {
            toWrite.push(`\n  ❓ Missing dependencies:`);
            for (const dep in result.missing) {
                if (dep === pkg.packageJson.name) {
                    if (this.fix && deps[dep]) {
                        delete devDependencies[dep];
                        toWrite.push(`  ${chalk.green('✅ ' + dep)} (removed self reference)`);
                        hasChanges = true;
                    } else if (this.interactive) {
                        const action = await this.promptAction(dep, 'unused', true);
                        if (action === 'remove') {
                            delete devDependencies[dep];
                            toWrite.push(`  ${chalk.green('✅ ' + dep)} (removed self reference)`);
                            hasChanges = true;
                        } else {
                            toWrite.push(`  ${chalk.yellow('⏭️  ' + dep)} (self reference, skipped)`);
                        }
                    } else {
                        toWrite.push(`  ${chalk.yellow('⚠️  ' + dep)} (self reference)`);
                    }
                } else {
                    let versionToUse = deps[dep];

                    // If no suggested version, try to get latest from npm
                    if (!versionToUse) {
                        versionToUse = await this.getLatestVersion(dep);
                    }

                    if (this.fix && versionToUse) {
                        dependencies[dep] = versionToUse;
                        const source = deps[dep] ? 'suggested' : 'latest from npm';
                        toWrite.push(`  ${chalk.green('✅ ' + dep)} (added version ${versionToUse} - ${source})`);
                        hasChanges = true;
                    } else if (this.interactive) {
                        const action = await this.promptAction(dep, 'missing', false, versionToUse);
                        if (action === 'add-dep' && versionToUse) {
                            dependencies[dep] = versionToUse;
                            const source = deps[dep] ? 'suggested' : 'latest from npm';
                            toWrite.push(
                                `  ${chalk.green('✅ ' + dep)} (added as dependency, version ${versionToUse} - ${source})`,
                            );
                            hasChanges = true;
                        } else if (action === 'add-dev' && versionToUse) {
                            devDependencies[dep] = versionToUse;
                            const source = deps[dep] ? 'suggested' : 'latest from npm';
                            toWrite.push(
                                `  ${chalk.green('✅ ' + dep)} (added as dev dependency, version ${versionToUse} - ${source})`,
                            );
                            hasChanges = true;
                        } else {
                            toWrite.push(`  ${chalk.yellow('⏭️  ' + dep)} (skipped)`);
                        }
                    } else {
                        if (versionToUse) {
                            const source = deps[dep] ? 'suggested' : 'latest available';
                            toWrite.push(`  ${chalk.yellow('❓ ' + dep)} (${source}: ${versionToUse})`);
                        } else {
                            toWrite.push(`  ${chalk.yellow('❓ ' + dep)} (version not found)`);
                        }
                    }
                }
            }
        }

        if (result.invalidFiles.length) {
            toWrite.push(`\n  ❌ Unable to parse files:`);
            for (const dep in result.invalidFiles) {
                toWrite.push(`  ${chalk.red('❌ ' + dep)}`);
            }
        }

        if (result.invalidDirs.length) {
            toWrite.push(`\n  ❌ Unable to parse dirs:`);
            for (const dep in result.invalidDirs) {
                toWrite.push(`  ${chalk.red('❌ ' + dep)}`);
            }
        }

        if (toWrite.length) {
            const packageName = chalk.underline(chalk.magenta(pkg.packageJson.name));
            const packagePath = `${pkg.path}/package.json`;

            this.logger.info(`\n${packageName} (${packagePath})`);
            for (const line of toWrite) {
                this.logger.info(line);
            }
        }

        if (hasChanges) {
            // Make sure there are no self references
            delete dependencies[pkg.packageJson.name!];
            delete devDependencies[pkg.packageJson.name!];

            // Save the updated package.json using saveFile
            await saveFile(`${pkg.path}/package.json`, JSON.stringify(pkg.packageJson, null, 2));
        }
    }

    /**
     * Fetches the latest version of a package from npm
     */
    private async getLatestVersion(packageName: string): Promise<string | undefined> {
        try {
            return await latestVersion(packageName);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.warn(chalk.yellow(`⚠️  Could not fetch latest version for ${packageName}: ${errorMessage}`));
            return undefined;
        }
    }

    /**
     * Prompts user for action on a dependency
     * @returns 'remove' | 'skip' for unused deps, 'add-dep' | 'add-dev' | 'skip' for missing deps
     */
    private async promptAction(
        dep: string,
        type: 'missing' | 'unused',
        isDev: boolean = false,
        version?: string,
    ): Promise<string> {
        const depName = chalk.cyan(dep);
        const devLabel = isDev ? chalk.cyanBright(' (dev)') : '';
        const versionInfo = version ? chalk.cyanBright(` (suggested: ${version})`) : '';

        const message =
            type === 'unused'
                ? `🗑️  Dependency ${depName}${devLabel} is unused. What do you want to do?`
                : `❓ Dependency ${depName}${devLabel} is missing${versionInfo}. What do you want to do?`;

        const choices =
            type === 'unused'
                ? [
                      {
                          name: 'remove',
                          message: `${chalk.red('Remove')}`,
                          value: 'remove',
                      },
                      { name: 'skip', message: `${chalk.yellow('Skip')}`, value: 'skip' },
                  ]
                : [
                      { name: 'add-dep', message: `${chalk.green('Add as dependency')}`, value: 'add-dep' },
                      { name: 'add-dev', message: `${chalk.blue('Add as dev dependency')}`, value: 'add-dev' },
                      { name: 'skip', message: `${chalk.yellow('Skip')}`, value: 'skip' },
                  ];

        const { action } = await enquirer.prompt<{ action: string }>({
            type: 'select',
            name: 'action',
            message,
            choices,
        });
        return action;
    }

    private getOptions(pkg: Package): depcheckImport.Options {
        const depcheckConfig: DepcheckConfig = (pkg.packageJson as { depcheck?: DepcheckConfig }).depcheck ?? {};

        const ignoreFiles = ['dist/**', ...(depcheckConfig?.ignoreFiles ?? [])];
        const ignoreDeps = depcheckConfig?.ignoreDeps ?? [];

        return {
            ignoreBinPackage: false, // ignore the packages with bin entry
            skipMissing: false, // skip calculation of missing dependencies
            ignorePatterns: ignoreFiles,
            ignoreMatches: ignoreDeps, //['@oclif/*'],
            parsers: {
                // the target parsers
                '**/*.js': depcheckImport.parser.es6,
                '**/*.jsx': depcheckImport.parser.jsx,
                '**/*.ts': depcheckImport.parser.typescript,
                '**/*.tsx': depcheckImport.parser.typescript,
                '**/*.scss': depcheckImport.parser.sass,
                '**/*.sass': depcheckImport.parser.sass,
                '**/*.vue': depcheckImport.parser.vue,
                '**/tsconfig.json': depcheckImport.parser.tsconfig,
                '**/tsconfig.*.json': depcheckImport.parser.tsconfig,
            },
            detectors: [
                // the target detectors
                depcheckImport.detector.requireCallExpression,
                depcheckImport.detector.requireCallExpression,
                depcheckImport.detector.importDeclaration,
                depcheckImport.detector.importCallExpression,
                depcheckImport.detector.exportDeclaration,
                depcheckImport.detector.typescriptImportEqualsDeclaration,
                depcheckImport.detector.typescriptImportType,
            ],
            specials: [
                // the target special parsers
                // depcheck.special.eslint,
                depcheckImport.special.jest,
            ],
        };
    }
}
