import * as path from 'path';

import chalk from 'chalk';
import { watch } from 'chokidar';
import { Option } from 'clipanion';
import glob from 'fast-glob';
import * as fsExtra from 'fs-extra';

import { compileTranslationFile } from '@nzyme/i18n-compiler/compileTranslationFile.js';
import { isFileIgnored } from '@nzyme/project-utils/isFileIgnored.js';

import { Command } from '../Command.js';

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

        let count = 0;
        const results = await Promise.all(files.map(file => this.compileFile(file, () => count++)));

        if (count > 0) {
            this.logger.info(`Compiled ${chalk.green(count)} translation files`);
        }

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
        const watcher = watch('**/*.loc.{yaml,yml}', {
            cwd: this.cwd,
            ignored: file => !!isFileIgnored(file),
            ignoreInitial: true,
            persistent: true,
        });

        this.logger.info('Watching for changes...');

        watcher.on('add', file => void this.onAddFile(file));
        watcher.on('change', file => void this.onAddFile(file));
        watcher.on('unlink', file => void this.onDeleteFile(file));
    }

    private async onAddFile(file: string) {
        await this.compileFile(file, f => {
            this.logger.info(`Compiled ${chalk.green(f)}`);
        });
    }

    private async onDeleteFile(file: string) {
        const outputPath = this.toTypesScriptPath(file);
        await fsExtra.remove(outputPath);
    }

    private async compileFile(file: string, logProcessedFile: (file: string) => void) {
        try {
            const absolutePath = this.toAbsolute(file);
            const outputPath = this.toTypesScriptPath(absolutePath);

            const result = await compileTranslationFile(absolutePath, outputPath);

            if (result.success) {
                logProcessedFile(file);
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
            this.logger.error(`Failed to compile ${file}`, { error });
            return false;
        }
    }

    private toAbsolute(file: string) {
        return path.isAbsolute(file) ? file : path.join(this.cwd, file);
    }

    private toTypesScriptPath(file: string) {
        return file.replace(/\.loc\.ya?ml$/, '.loc.ts');
    }
}
