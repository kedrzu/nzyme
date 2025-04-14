import type { GetObjectCommandInput } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import chalk from 'chalk';
import { lookup as mimeLookup } from 'mime-types';
import { S3SyncClient } from 's3-sync-client';

import { type Logger, PrettyLogger } from '@nzyme/logging';
import { assertValue } from '@nzyme/utils';

type Filter = (key: string) => boolean;

/**
 * Options for uploading files to an S3 bucket.
 */
export type UploadFilesOptions = {
    /**
     * The path to the source files.
     */
    sourcePath: string;
    /**
     * The path to the destination files.
     */
    destinationPath: string;
    /**
     * A filter for the files to include.
     */
    include?: RegExp | Filter;
    /**
     * A filter for the files to exclude.
     */
    exclude?: RegExp | Filter;
    /**
     * A function to rename the files.
     */
    rename?: (key: string) => string;
    /**
     * The cache control header to set for the files.
     */
    cacheControl?: string | ((key: string) => string);
    /**
     * Whether to delete missing files.
     */
    deleteMissing?: boolean;
    /**
     * A logger to use for logging.
     */
    logger?: Logger;
};

/**
 * Uploads files to an S3 bucket.
 */
export async function uploadFilesToS3Bucket(options: UploadFilesOptions) {
    const logger = options.logger ?? PrettyLogger.create({ name: undefined });
    const s3Client = new S3Client();
    const client = new S3SyncClient({
        client: s3Client,
    });

    try {
        const { sourcePath, destinationPath, cacheControl } = options;
        const cacheControlFunction =
            typeof cacheControl === 'function' ? cacheControl : () => cacheControl;

        logger.info(`Uploading ${chalk.green(sourcePath)} to ${chalk.green(destinationPath)}`);
        const output = await client.sync(sourcePath, destinationPath, {
            del: !!options.deleteMissing,
            filters:
                options.include || options.exclude
                    ? [
                          {
                              exclude: createFilter(options.exclude),
                              include: createFilter(options.include),
                          },
                      ]
                    : undefined,
            // Make all the files lowercase.
            // This way we can use case-insensitive routing in Cloudfront.
            relocations: options.rename ? [options.rename] : undefined,
            commandInput: (input: Partial<GetObjectCommandInput>) => {
                const key = assertValue(input.Key);

                return {
                    ContentType: mimeLookup(key) || 'text/html',
                    CacheControl: cacheControlFunction(key),
                };
            },
        });

        logger.info(
            `Finished uploading ${chalk.green(sourcePath)} to ${chalk.green(destinationPath)}`,
        );

        if (output.created.length) {
            logger.info(
                `Created ${chalk.green(output.created.length)} files in ${chalk.green(destinationPath)}`,
            );
        }
        if (output.updated.length) {
            logger.info(
                `Updated ${chalk.green(output.updated.length)} files in ${chalk.green(destinationPath)}`,
            );
        }
        if (output.deleted.length) {
            logger.info(
                `Deleted ${chalk.green(output.deleted.length)} files in ${chalk.green(destinationPath)}`,
            );
        }
    } finally {
        s3Client.destroy();
    }
}

function createFilter(filter: RegExp | Filter | undefined | null): Filter | undefined {
    if (!filter) {
        return undefined;
    }

    if (filter instanceof RegExp) {
        return (key: string) => filter.test(key);
    }

    return filter;
}
