import type { Package } from '@lerna/package';
import { getPackages } from '@lerna/project';
import chalk from 'chalk';
import { compareVersions } from 'compare-versions';
import depcheckImport from 'depcheck';

import { Command } from '../Command.js';
import { Option } from '../index.js';

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

    /**
     *
     */
    override async run() {
        const cwd = process.cwd();
        const packages = await getPackages(cwd);

        const deps: Record<string, string> = {};
        for (const pkg of packages) {
            if (pkg.dependencies) {
                for (const dep in pkg.dependencies) {
                    const version = pkg.dependencies[dep]!;
                    if (!deps[dep]) {
                        deps[dep] = version;
                        continue;
                    }

                    if (version === '*' || deps[dep] === '*') {
                        continue;
                    }

                    if (compareVersions(version, deps[dep])) {
                        deps[dep] = version;
                        continue;
                    }
                }
            }
        }

        packages.sort((a, b) => a.name.localeCompare(b.name));
        const promises = packages.map(p => this.processPackage(p, deps));
        await Promise.all(promises);
    }

    private async processPackage(pkg: Package, deps: Record<string, string>) {
        const pkgConfig = this.getOptions(pkg);
        const result = await depcheckImport(pkg.location, pkgConfig);
        const toWrite: string[] = [];

        let dependencies = pkg.dependencies;
        if (!dependencies) {
            dependencies = {};
            pkg.set('dependencies', dependencies);
        }

        let devDependencies = pkg.devDependencies;
        if (!devDependencies) {
            devDependencies = {};
            pkg.set('devDependencies', devDependencies);
        }

        if (result.dependencies.length) {
            toWrite.push(`\n  Unused dependencies:`);
            for (const dep of result.dependencies) {
                if (this.fix) {
                    delete dependencies[dep];
                    toWrite.push(`  ${chalk.green(dep)} (removed)`);
                } else {
                    toWrite.push(`  ${chalk.yellow(dep)}`);
                }
            }
        }

        if (result.devDependencies.length) {
            toWrite.push(`\n  Unused dev dependencies:`);
            for (const dep of result.devDependencies) {
                if (this.fix) {
                    delete devDependencies[dep];
                    toWrite.push(`  ${chalk.green(dep)} (removed)`);
                } else {
                    toWrite.push(`  ${chalk.yellow(dep)}`);
                }
            }
        }

        if (Object.keys(result.missing).length) {
            toWrite.push(`\n  Missing dependencies:`);
            for (const dep in result.missing) {
                if (dep === pkg.name) {
                    if (this.fix && deps[dep]) {
                        delete devDependencies[dep];
                        toWrite.push(`  ${chalk.green(dep)} (removed self reference)`);
                    } else {
                        toWrite.push(`  ${chalk.yellow(dep)} (self reference)`);
                    }
                } else {
                    if (this.fix && deps[dep]) {
                        dependencies[dep] = deps[dep];
                        toWrite.push(`  ${chalk.green(dep)} (added version ${deps[dep]})`);
                    } else {
                        toWrite.push(`  ${chalk.yellow(dep)}`);
                    }
                }
            }
        }

        if (result.invalidFiles.length) {
            toWrite.push(`\n  Unabled to parse files:`);
            for (const dep in result.invalidFiles) {
                toWrite.push(`  ${chalk.red(dep)}`);
            }
        }

        if (result.invalidDirs.length) {
            toWrite.push(`\n  Unabled to parse dirs:`);
            for (const dep in result.invalidDirs) {
                toWrite.push(`  ${chalk.red(dep)}`);
            }
        }

        if (toWrite.length) {
            const packageName = chalk.underline(chalk.magenta(pkg.name));
            const packagePath = `${pkg.location}/package.json`;

            console.log(`\n${packageName} (${packagePath})`);
            for (const line of toWrite) {
                console.log(line);
            }
        }

        if (this.fix) {
            // Make sure there are no self references
            delete dependencies[pkg.name];
            delete devDependencies[pkg.name];

            await pkg.serialize();
        }
    }

    private getOptions(pkg: Package): depcheckImport.Options {
        const depcheckConfig = pkg.get('depcheck');

        return {
            ignoreBinPackage: false, // ignore the packages with bin entry
            skipMissing: false, // skip calculation of missing dependencies
            ignorePatterns: depcheckConfig?.ignoreFiles ?? [],
            ignoreMatches: depcheckConfig?.ignoreDeps ?? [], //['@oclif/*'],
            parsers: {
                // the target parsers
                '**/*.js': depcheckImport.parser.es6,
                '**/*.jsx': depcheckImport.parser.jsx,
                '**/*.ts': depcheckImport.parser.typescript,
                '**/*.tsx': depcheckImport.parser.typescript,
                '**/*.scss': depcheckImport.parser.sass,
                '**/*.sass': depcheckImport.parser.sass,
                '**/*.vue': depcheckImport.parser.vue,
            },
            detectors: [
                // the target detectors
                depcheckImport.detector.requireCallExpression,
                depcheckImport.detector.importDeclaration,
            ],
            specials: [
                // the target special parsers
                // depcheck.special.eslint,
                depcheckImport.special.jest,
            ],
        };
    }
}
