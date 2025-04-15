import * as path from 'path';

import { outputFile } from 'fs-extra/esm';
import { lookup as mimeLookup } from 'mime-types';
import { defineNuxtModule } from 'nuxt/kit';
import type { Connect } from 'vite';

type FileContent = string | (() => string | Promise<string>);

type PublicFilesModuleOptions = {
    [fileName: string]: FileContent;
};

export function publicFilesModule(options: PublicFilesModuleOptions) {
    return defineNuxtModule({
        setup(opts, nuxt) {
            const rootDir = nuxt.options.rootDir;
            const publicDir = path.join(rootDir, '.output/public');

            nuxt.hook('vite:serverCreated', server => {
                for (const [fileName, content] of Object.entries(options)) {
                    const filePath = `/${fileName}`;
                    const middleware = createMiddleware(fileName, content);
                    server.middlewares.use(filePath, middleware);
                }
            });

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

    return (req, res) => {
        void resolveFileContent(fileContent).then(content => {
            res.writeHead(200, {
                'Content-Length': content.length,
                'Content-Type': mimeType,
            });

            res.write(content);
            res.end();
        });
    };
}

function resolveFileContent(fileContent: FileContent): Promise<string> {
    if (typeof fileContent === 'string') {
        return Promise.resolve(fileContent);
    }

    return Promise.resolve(fileContent());
}
