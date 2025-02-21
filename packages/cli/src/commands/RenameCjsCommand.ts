import path from 'path';
import fs from 'fs/promises';
import type { Package } from '@lerna/package';
import { getPackages } from '@lerna/project';
import { Command } from '@oclif/core';
import glob from 'fast-glob';

interface TsConfig {
    path: string;
    config: Record<string, any>;
    resolved: Record<string, any>;
}

const jsRegex = /\.js([^\w]|$)/g;

export class RenameCjsCommand extends Command {
    async run() {
        const cwd = process.cwd();
        const packages = await getPackages(cwd);

        await Promise.all(packages.map(pkg => this.processPackage(pkg)));
    }

    async processPackage(pkg: Package) {
        const files = await glob(['dist/cjs/**/*.js', 'dist/cjs/**/*.js.map'], {
            cwd: pkg.location,
        });

        await Promise.all(files.map(file => this.processFile(path.join(pkg.location, file))));
    }

    async processFile(file: string) {
        const content = await fs.readFile(file, 'utf8');
        const newContent = replaceJs(content);
        const newName = replaceJs(file);

        await fs.writeFile(file, newContent);
        await fs.rename(file, newName);
    }
}

function replaceJs(file: string) {
    return file.replace(jsRegex, (_match, p1) => '.cjs' + (p1 || ''));
}
