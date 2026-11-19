import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The executable of the Google Chrome installed on this computer in its standard place, or `null`. Looks only at the
 * installer's own paths, never the registry or `PATH`, so it finds Google Chrome and nothing that merely calls itself
 * `chrome`.
 */
export function findChrome(): string | null {
    for (const candidate of getChromePaths()) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function getChromePaths() {
    switch (process.platform) {
        case 'darwin': {
            const app = 'Google Chrome.app/Contents/MacOS/Google Chrome';
            return [path.join('/Applications', app), path.join(os.homedir(), 'Applications', app)];
        }
        case 'win32': {
            const exe = path.join('Google', 'Chrome', 'Application', 'chrome.exe');
            const roots = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']];
            return roots.filter(root => root != null).map(root => path.join(root, exe));
        }
        case 'linux':
            return ['/opt/google/chrome/chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'];
        default:
            return [];
    }
}
