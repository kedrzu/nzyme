import * as fs from 'fs/promises';
import * as path from 'path';

import chalk from 'chalk';
import { watch } from 'chokidar';
import { Option } from 'clipanion';
import { consola } from 'consola';
import glob from 'fast-glob';

import { compileTranslations } from '@nzyme/i18n-compiler';
import { waitForever } from '@nzyme/utils';

import { Command } from '../Command.js';
import { saveFile } from '../utils/saveFile.js';

const I18N_REGEX = /\.loc\.ya?ml$/;

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
            await this.startWatcher();
        }

        if (results.some(result => !result)) {
            consola.error('Failed to compile some files');
            return 1;
        }

        return 0;
    }

    private async startWatcher() {
        const watcher = watch('.', {
            cwd: this.cwd,
            ignored: ['node_modules', 'dist'],
            ignoreInitial: true,
        });

        consola.info('Watching for changes...');

        watcher.on('add', file => void this.onAddFile(file));
        watcher.on('change', file => void this.onAddFile(file));
        watcher.on('unlink', file => void this.onDeleteFile(file));

        await waitForever();
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
        await fs.unlink(outputPath);
    }

    private async compileFile(file: string) {
        const absolutePath = this.toAbsolute(file);
        const outputPath = this.toTypesScriptPath(file);

        const content = await fs.readFile(absolutePath, 'utf8');
        const result = compileTranslations(content);

        await saveFile(outputPath, result.code);

        if (result.errors.length === 0) {
            consola.success(`Compiled ${chalk.green(file)}`);
            return true;
        }

        for (const error of result.errors) {
            const lang = error.lang ? `/${error.lang}` : '';
            const key = error.key ? chalk.magenta(`[${error.key}${lang}]`) : '';
            const message = `${chalk.cyan(file)}${chalk.yellow(`:${error.line}:${error.column}`)} ${key} - ${error.message}`;

            console.error(message);
        }

        return false;
    }

    private toAbsolute(file: string) {
        return path.isAbsolute(file) ? file : path.join(this.cwd, file);
    }

    private toTypesScriptPath(file: string) {
        return file.replace(I18N_REGEX, '.loc.ts');
    }
}
