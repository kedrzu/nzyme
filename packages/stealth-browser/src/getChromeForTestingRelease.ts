import path from 'node:path';

import { assertNever } from '@nzyme/utils/assertNever.js';

/** One Chrome for Testing build on this computer: which archive to fetch and where its executable is once unpacked. */
export interface ChromeForTestingRelease {
    version: string;
    /** Chrome for Testing's platform name (`mac-arm64`); part of the archive's URL and the install folder's name. */
    platform: ChromeForTestingPlatform;
    /** The archive's SHA-256, lowercase hex; `undefined` for a version that is not pinned. */
    sha256: string | undefined;
    /** The executable's path inside the unpacked archive. */
    executable: string;
}

/** The platforms a build is pinned for. */
export type ChromeForTestingPlatform = 'mac-arm64' | 'mac-x64' | 'win64' | 'linux64';

/**
 * The pinned version. A bump also re-checks the Google Chrome brand (`buildChromeBrand`): read
 * `navigator.userAgentData` brands and `fullVersionList` from installed Google Chrome of the new version and update
 * the brand test's expected lists if they differ; then pin every platform's archive SHA-256 below.
 */
const PINNED_VERSION = '157.0.8103.78';

/** The SHA-256 of each platform's archive of `PINNED_VERSION`. */
const PINNED_SHA256: Record<ChromeForTestingPlatform, string> = {
    'mac-arm64': 'bf3b49d0fe62a62397e98641aa736ef813c46014f03ec13d4913442e6966c7fc',
    'mac-x64': '8f9590a4e011ba4ea135f50c711f8bf2c7f32b1fac20de68d1b85f010f095ab3',
    win64: '5f6ec40206407112702e163bf694d07f9fdc8ccbd346c70ce61fa62f716493f9',
    linux64: '9223832977a13db3646201b1341c1f9cf08afa3ceae92540116d7b0c062364fb',
};

/**
 * The Chrome for Testing build of `version` for this computer, the pinned one by default; the pinned version keeps its
 * pinned checksum even when named. Throws on a platform no build is pinned for.
 */
export function getChromeForTestingRelease(version?: string): ChromeForTestingRelease {
    const platform = getPlatform();
    if (!platform) {
        throw new Error(
            `Chrome for Testing is not available for ${process.platform}-${process.arch}: use an installed Chrome`,
        );
    }

    const releaseVersion = version ?? PINNED_VERSION;
    return {
        version: releaseVersion,
        platform,
        sha256: releaseVersion === PINNED_VERSION ? PINNED_SHA256[platform] : undefined,
        executable: getExecutable(platform),
    };
}

/** The folder a release is unpacked into: `<cacheDir>/<version>-<platform>`, present only once fully unpacked. */
export function getChromeForTestingFolder(cacheDir: string, release: ChromeForTestingRelease) {
    return path.join(cacheDir, `${release.version}-${release.platform}`);
}

function getPlatform(): ChromeForTestingPlatform | null {
    switch (process.platform) {
        case 'darwin':
            return process.arch === 'arm64' ? 'mac-arm64' : process.arch === 'x64' ? 'mac-x64' : null;
        case 'win32':
            return process.arch === 'x64' ? 'win64' : null;
        case 'linux':
            return process.arch === 'x64' ? 'linux64' : null;
        default:
            return null;
    }
}

function getExecutable(platform: ChromeForTestingPlatform) {
    switch (platform) {
        case 'mac-arm64':
        case 'mac-x64':
            return `chrome-${platform}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
        case 'win64':
            return 'chrome-win64/chrome.exe';
        case 'linux64':
            return 'chrome-linux64/chrome';
        default:
            return assertNever(platform);
    }
}
