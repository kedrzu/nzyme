import type { Package } from '@lerna/package';
import { getPackages } from '@lerna/project';
import chalk from 'chalk';
import { Option } from 'clipanion';
import { compareVersions } from 'compare-versions';
import { consola } from 'consola';
import depcheckImport from 'depcheck';

import { defineCommand } from '../defineCommand.js';

export const DepcheckCommand = defineCommand({
    path: 'depcheck',
    args: {
        fix: Option.Boolean('--fix,-f', {
            description: 'Fix the dependencies',
        }),
    },
    execute: async ({ args }) => {
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
        const promises = packages.map(p => processPackage(p, deps));
        await Promise.all(promises);

        async function processPackage(pkg: Package, deps: Record<string, string>) {
            const pkgConfig = getOptions(pkg);
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
                    if (args.fix) {
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
                    if (args.fix) {
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
                        if (args.fix && deps[dep]) {
                            delete devDependencies[dep];
                            toWrite.push(`  ${chalk.green(dep)} (removed self reference)`);
                        } else {
                            toWrite.push(`  ${chalk.yellow(dep)} (self reference)`);
                        }
                    } else {
                        if (args.fix && deps[dep]) {
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

                consola.log(`\n${packageName} (${packagePath})`);
                for (const line of toWrite) {
                    consola.log(line);
                }
            }

            if (args.fix) {
                // Make sure there are no self references
                delete dependencies[pkg.name];
                delete devDependencies[pkg.name];

                await pkg.serialize();
            }
        }

        function getOptions(pkg: Package): depcheckImport.Options {
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
    },
});
