import * as path from 'path';

import chalk from 'chalk';
import { watch } from 'chokidar';
import { Option } from 'clipanion';
import glob from 'fast-glob';
import * as fsExtra from 'fs-extra';

import { compileTranslationFile } from '@nzyme/i18n-compiler';

import { Command } from '../Command.js';

const I18N_REGEX = /\.loc\.ya?ml$/;

/**
 *
 */
export class LocaliseCommand extends Command {
    static override paths = [['localise']];

    static override usage = Command.Usage({
        category: 'Localise',
        description: 'Localise the project',
    });

    watch = Option.Boolean('--watch,-w', {
        description: 'Watch for changes',
    });

    cwd = process.cwd();

    /**
     * Execute the command.
     */
    override async run() {
        const files = await glob('**/*.loc.{yaml,yml}', {
            cwd: this.cwd,
            ignore: ['node_modules', 'dist'],
        });

        const results = await Promise.all(files.map(file => this.compileFile(file)));

        if (this.watch) {
            this.startWatcher();
        }

        if (results.some(result => !result)) {
            this.logger.error('Failed to compile some files');
            return 1;
        }

        return 0;
    }

    private startWatcher() {
        const watcher = watch('.', {
            cwd: this.cwd,
            ignored: path => {
                if (path.includes('/node_modules/')) {
                    return true;
                }

                return !I18N_REGEX.test(path);
            },
            ignoreInitial: true,
            persistent: true,
        });

        this.logger.info('Watching for changes...');

        watcher.on('add', file => void this.onAddFile(file));
        watcher.on('change', file => void this.onAddFile(file));
        watcher.on('unlink', file => void this.onDeleteFile(file));
    }

    private async onAddFile(file: string) {
        if (!I18N_REGEX.test(file)) {
            return;
        }

        await this.compileFile(file);
    }

    private async onDeleteFile(file: string) {
        if (!I18N_REGEX.test(file)) {
            return;
        }

        const outputPath = this.toTypesScriptPath(file);
        await fsExtra.remove(outputPath);
    }

    private async compileFile(file: string) {
        try {
            const absolutePath = this.toAbsolute(file);
            const outputPath = this.toTypesScriptPath(file);

            const result = await compileTranslationFile(absolutePath, outputPath);

            if (result.success) {
                this.logger.info(`🌍 Compiled ${chalk.green(file)}`);
                return true;
            }

            for (const error of result.errors) {
                const lang = error.lang ? `/${error.lang}` : '';
                const key = error.key ? chalk.magenta(`[${error.key}${lang}]`) : '';
                const message = `${chalk.cyan(file)}${chalk.yellow(`:${error.line}:${error.column}`)} ${key} - ${error.message}`;

                this.logger.error(message);
            }

            return false;
        } catch (error) {
            this.logger.error(`❌ Failed to compile ${file}`, { error });
            return false;
        }
    }

    private toAbsolute(file: string) {
        return path.isAbsolute(file) ? file : path.join(this.cwd, file);
    }

    private toTypesScriptPath(file: string) {
        return file.replace(I18N_REGEX, '.loc.ts');
    }
}
