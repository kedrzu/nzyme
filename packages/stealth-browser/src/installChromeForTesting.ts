import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '@nzyme/logging/createLogger.js';
import type { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';

import { getChromeForTestingFolder, getChromeForTestingRelease } from './getChromeForTestingRelease.js';
import type { ChromeForTestingRelease } from './getChromeForTestingRelease.js';

/** Which Chrome for Testing to install, and where. */
export interface InstallChromeForTestingOptions {
    /** The folder every version is installed in, each in `<version>-<platform>/`. */
    cacheDir: string;
    /** The pinned version by default. */
    version?: string;
    /**
     * The archive's SHA-256, lowercase hex; the pinned version's is known. A version with none is downloaded over HTTPS
     * unverified.
     */
    sha256?: string;
    /** Where the archives are downloaded from; Chrome for Testing's storage by default. A test serves its own. */
    baseUrl?: string;
    logger?: Logger;
}

/** An installed Chrome for Testing. */
export interface InstalledChromeForTesting {
    executablePath: string;
    version: string;
}

/** Chrome for Testing's public storage: `<version>/<platform>/chrome-<platform>.zip`. */
const BASE_URL = 'https://storage.googleapis.com/chrome-for-testing-public';
/** Prefix of everything an install in progress leaves in the cache folder; a failed install's leftovers are removed. */
const TEMP_PREFIX = '.install-';

/** The install running for each install folder, which calls made meanwhile join. */
const running = new Map<string, Promise<InstalledChromeForTesting>>();
/** The temporary folders of installs in progress in this process, which the leftover cleanup keeps. */
const working = new Set<string>();

/**
 * Installs Chrome for Testing unless it is installed: downloads the archive, checks its SHA-256 before anything is
 * unpacked, unpacks it into a temporary folder and only then renames it into `<cacheDir>/<version>-<platform>/`, so
 * that folder exists only once fully unpacked. Calls made meanwhile for the same folder join the running install; a
 * failure rejects them all and the next call starts over. Throws on a platform no build is pinned for.
 */
export async function installChromeForTesting(
    options: InstallChromeForTestingOptions,
): Promise<InstalledChromeForTesting> {
    const pinned = getChromeForTestingRelease(options.version);
    const release: ChromeForTestingRelease = { ...pinned, sha256: options.sha256 ?? pinned.sha256 };
    const folder = getChromeForTestingFolder(options.cacheDir, release);
    const installed: InstalledChromeForTesting = {
        executablePath: path.join(folder, release.executable),
        version: release.version,
    };
    if (existsSync(installed.executablePath)) {
        return installed;
    }

    let install = running.get(folder);
    if (!install) {
        install = installRelease({
            release,
            cacheDir: options.cacheDir,
            folder,
            baseUrl: options.baseUrl ?? BASE_URL,
            logger: options.logger ?? createLogger('ChromeForTesting'),
        })
            .then(() => installed)
            .finally(() => running.delete(folder));
        running.set(folder, install);
    }
    return install;
}

/** One install of a release into its folder. */
interface InstallReleaseParams {
    release: ChromeForTestingRelease;
    cacheDir: string;
    folder: string;
    baseUrl: string;
    logger: Logger;
}

async function installRelease(params: InstallReleaseParams) {
    const { release, cacheDir, folder, logger } = params;
    const url = `${params.baseUrl}/${release.version}/${release.platform}/chrome-${release.platform}.zip`;
    if (release.sha256) {
        logger.info('Chrome for Testing is downloading', { version: release.version, platform: release.platform });
    } else {
        logger.warn('Chrome for Testing is downloading unverified: no checksum is pinned for this version', {
            version: release.version,
            platform: release.platform,
        });
    }

    await mkdir(cacheDir, { recursive: true });
    await removeLeftovers(cacheDir);

    const work = await mkdtemp(path.join(cacheDir, TEMP_PREFIX));
    working.add(work);
    try {
        const archive = path.join(work, 'chrome.zip');
        const unpacked = path.join(work, 'unpacked');
        await download({ url, sha256: release.sha256, file: archive });
        await unpack(archive, unpacked);
        assert(existsSync(path.join(unpacked, release.executable)), 'The archive holds the executable');

        await rm(folder, { recursive: true, force: true });
        await rename(unpacked, folder);
    } catch (error) {
        logger.error('Chrome for Testing failed to install', { error, version: release.version });
        throw error;
    } finally {
        await rm(work, { recursive: true, force: true });
        working.delete(work);
    }

    logger.info('Chrome for Testing is installed', { version: release.version });
}

/** An archive to download. */
interface DownloadParams {
    url: string;
    /** Checked once the whole archive is in; none: the archive is not verified. */
    sha256: string | undefined;
    file: string;
}

/** Streams the archive to `file` and fails, leaving nothing behind to unpack, unless its SHA-256 is the expected one. */
async function download({ url, sha256, file }: DownloadParams) {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new Error(`Chrome for Testing download failed: HTTP ${response.status}`);
    }

    const hasher = new Bun.CryptoHasher('sha256');
    const writer = Bun.file(file).writer();
    const body: ReadableStream<Uint8Array> = response.body;
    const reader = body.getReader();
    try {
        for (let part = await reader.read(); !part.done; part = await reader.read()) {
            hasher.update(part.value);
            await writer.write(part.value);
        }
    } finally {
        await writer.end();
    }

    const actual = hasher.digest('hex');
    if (sha256 && actual !== sha256) {
        await rm(file, { force: true });
        throw new Error(`Chrome for Testing download does not match the pinned checksum (got ${actual})`);
    }
}

/**
 * Unpacks with the system's own tool: `ditto` on macOS keeps the symlinks of the app's frameworks, which a plain unzip
 * would break; Windows' `tar` reads zip archives; Linux needs `unzip`.
 */
async function unpack(archive: string, destination: string) {
    const command = getUnpackCommand(archive, destination);
    const [tool] = command;
    assert(tool, 'The unpack command names its tool');
    if (!Bun.which(tool)) {
        throw new Error(`Chrome for Testing cannot be unpacked: \`${tool}\` is not installed`);
    }

    await mkdir(destination, { recursive: true });
    const child = Bun.spawn(command, { stdout: 'ignore', stderr: 'pipe' });
    const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    if (exitCode !== 0) {
        throw new Error(`Chrome for Testing failed to unpack (${tool} exit ${exitCode}): ${stderr.trim()}`);
    }
}

function getUnpackCommand(archive: string, destination: string) {
    switch (process.platform) {
        case 'darwin':
            return ['ditto', '-x', '-k', archive, destination];
        case 'win32':
            return ['tar', '-xf', archive, '-C', destination];
        default:
            return ['unzip', '-q', archive, '-d', destination];
    }
}

/** Removes what failed installs left in the cache folder, but not the folders of installs still running here. */
async function removeLeftovers(cacheDir: string) {
    for (const name of await readdir(cacheDir)) {
        if (name.startsWith(TEMP_PREFIX) && !working.has(path.join(cacheDir, name))) {
            await rm(path.join(cacheDir, name), { recursive: true, force: true });
        }
    }
}
