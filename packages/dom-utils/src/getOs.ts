import type { StringNonLiteral } from '@nzyme/types/Common.js';
import { createMemo } from '@nzyme/utils/createMemo.js';

type OS = 'Android' | 'iOS' | 'Linux' | 'macOS' | 'Unknown' | 'Windows';

const os = createMemo((): OS | StringNonLiteral => getOSCore());

/**
 * Returns the operating system of the browser.
 * @util
 */
export function getOS() {
    return os();
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

    if (platform.includes('Mac')) {
        return 'macOS';
    }
    if (platform.includes('Win')) {
        return 'Windows';
    }
    if (platform.includes('Linux')) {
        return 'Linux';
    }
    if (/iPhone|iPad|iPod/.test(userAgent)) {
        return 'iOS';
    }
    if (userAgent.includes('Android')) {
        return 'Android';
    }

    return 'Unknown';
}
