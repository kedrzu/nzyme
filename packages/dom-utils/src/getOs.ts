import type { StringNonLiteral } from '@nzyme/types/Common.js';

type OS = 'Android' | 'iOS' | 'Linux' | 'macOS' | 'Unknown' | 'Windows';

let os: OS | StringNonLiteral | undefined;

/**
 * Returns the operating system of the browser.
 */
export function getOS() {
    if (os !== undefined) {
        return os;
    }

    return (os = getOSCore());
}

function getOSCore() {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
        return 'Unknown';
    }

    const userAgent = navigator.userAgent || navigator.vendor;
    const platform = navigator.platform || 'unknown';

    // Use userAgentData if available (modern browsers)
    if (navigator.userAgentData?.platform) {
        return navigator.userAgentData.platform;
    }

    if (/Mac/.test(platform)) {
        return 'macOS';
    }
    if (/Win/.test(platform)) {
        return 'Windows';
    }
    if (/Linux/.test(platform)) {
        return 'Linux';
    }
    if (/iPhone|iPad|iPod/.test(userAgent)) {
        return 'iOS';
    }
    if (/Android/.test(userAgent)) {
        return 'Android';
    }

    return 'Unknown';
}
