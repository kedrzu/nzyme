import * as fs from 'fs/promises';
import path from 'path';

import type { Package } from '@lerna/package';
import { getPackages } from '@lerna/project';
import { $ } from 'execa';
import glob from 'fast-glob';
import { outputFile } from 'fs-extra';

import { defineCommand } from '../defineCommand.js';

export const BuildCommand = defineCommand({
    path: 'build cjs',
    description: 'Build the project in CommonJS',
    execute: async () => {
        const cwd = process.cwd();
        const jsRegex = /\.js([^\w]|$)/g;

        const cli = $({
            stdout: 'inherit',
            stderr: 'inherit',
            shell: true,
        });

        await cli`tsc --build ./tsconfig.cjs.json`;

        const packages = await getPackages(cwd);

        await Promise.all(packages.map(processPackage));

        async function processPackage(pkg: Package) {
            const files = await glob(['./dist-cjs/**/*.js', './dist-cjs/**/*.js.map'], {
                cwd: pkg.location,
            });

            await Promise.all(files.map(file => processFile(file, pkg)));
        }

        async function processFile(file: string, pkg: Package) {
            const filePath = path.join(pkg.location, file);

            const content = await fs.readFile(filePath, 'utf8');
            const newContent = replaceJs(content);
            const newPath = replaceJs(filePath).replace('/dist-cjs/', '/dist/');

            await outputFile(newPath, newContent);
        }

        function replaceJs(file: string) {
            return file.replace(jsRegex, (_match, p1) => '.cjs' + (p1 || ''));
        }
    },
});
