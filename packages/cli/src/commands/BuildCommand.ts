import * as fs from 'fs/promises';
import path from 'path';

import type { Package } from '@lerna/package';
import { getPackages } from '@lerna/project';
import { $ } from 'execa';
import glob from 'fast-glob';
import { outputFile } from 'fs-extra';
import { Command } from '../Command.js';

const jsRegex = /\.js([^\w]|$)/g;

/**
 * Command to build the project in CommonJS format
 */
export class BuildCommand extends Command {
    static override paths = [['build']];

    static override usage = Command.Usage({
        category: 'Build',
        description: 'Build the project in CommonJS',
    });

    /**
     * Execute the command.
     */
    override async run() {
        const cwd = process.cwd();

        const cli = $({
            stdout: 'inherit',
            stderr: 'inherit',
            shell: true,
        });

        await cli`tsc --build ./tsconfig.cjs.json`;

        const packages = await getPackages(cwd);

        await Promise.all(packages.map(pkg => this.processPackage(pkg)));
    }

    private async processPackage(pkg: Package) {
        const files = await glob(['./dist-cjs/**/*.js', './dist-cjs/**/*.js.map'], {
            cwd: pkg.location,
        });

        await Promise.all(files.map(file => this.processFile(file, pkg)));
    }

    private async processFile(file: string, pkg: Package) {
        const filePath = path.join(pkg.location, file);

        const content = await fs.readFile(filePath, 'utf8');
        const newContent = this.replaceJs(content);
        const newPath = this.replaceJs(filePath).replace('/dist-cjs/', '/dist/');

        await outputFile(newPath, newContent);
    }

    private replaceJs(file: string) {
        return file.replace(jsRegex, (_match, p1) => '.cjs' + (p1 || ''));
    }
}
