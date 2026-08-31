import * as path from 'node:path';

import { outputFile } from 'fs-extra/esm';
import { lookup as mimeLookup } from 'mime-types';
import { defineNuxtModule } from 'nuxt/kit';
import type { NuxtModule } from 'nuxt/schema';
import type { Connect } from 'vite';

type FileContent = (() => string | Promise<string>) | string;

type PublicFilesModuleOptions = {
    [fileName: string]: FileContent;
};

/**
 * This module is used to output files to the output directory.
 */
export function outputFilesModule(options: PublicFilesModuleOptions): NuxtModule {
    return defineNuxtModule({
        setup(_opts, nuxt) {
            const rootDir = nuxt.options.rootDir;
            const publicDir = path.join(rootDir, '.output/public');

            nuxt.hook('vite:serverCreated', server => {
                for (const [fileName, content] of Object.entries(options)) {
                    const filePath = `/${fileName}`;
                    const middleware = createMiddleware(fileName, content);
                    server.middlewares.use(filePath, middleware);
                }
            });

            // @ts-expect-error nitro hooks are not typed in NuxtHooks anymore
            nuxt.hook('nitro:build:public-assets', async () => {
                for (const [fileName, fileContent] of Object.entries(options)) {
                    const content = await resolveFileContent(fileContent);
                    const filePath = path.join(publicDir, fileName);

                    await outputFile(filePath, content);
                }
            });
        },
    });
}

function createMiddleware(fileName: string, fileContent: FileContent): Connect.NextHandleFunction {
    const mimeType = mimeLookup(fileName) || 'application/octet-stream';

    return (_req, res) => {
        void resolveFileContent(fileContent).then(content => {
            res.writeHead(200, {
                'Content-Length': content.length,
                'Content-Type': mimeType,
            });

            res.write(content);
            res.end();
            return undefined;
        });
    };
}

function resolveFileContent(fileContent: FileContent): Promise<string> {
    if (typeof fileContent === 'string') {
        return Promise.resolve(fileContent);
    }

    return Promise.resolve(fileContent());
}
