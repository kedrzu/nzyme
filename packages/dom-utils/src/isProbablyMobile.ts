let isMobile: boolean | undefined;

/**
 * Used to check if the device is probably a mobile device.
 * @util
 */
export function isProbablyMobile() {
    if (isMobile !== undefined) {
        return isMobile;
    }

    return (isMobile = isProbablyMobileCore());
}

function isProbablyMobileCore() {
    if (typeof navigator === 'undefined') {
        return false;
    }

    // 1.  User-Agent Client Hints (Chrome ≥ 89, Edge, Opera)
    // https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/mobile
    if (navigator.userAgentData?.mobile !== undefined) {
        return navigator.userAgentData.mobile;
    }

    // 2.  Pointer & hover capability (CSS Media Queries Level 4)
    //     Phones/tablets: coarse pointer, no hover
    // https://www.smashingmagazine.com/2022/03/guide-hover-pointer-media-queries/
    const noHover = matchMedia('(hover: none)').matches;
    const coarse = matchMedia('(pointer: coarse)').matches;

    // 3.  Number of touch points
    const touchPoints = navigator.maxTouchPoints || 0;

    return noHover && coarse && touchPoints > 0;
}
