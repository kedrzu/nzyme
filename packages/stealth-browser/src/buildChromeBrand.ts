/** One brand of a CDP `UserAgentMetadata` list, as `navigator.userAgentData.brands` shows it. */
export interface BrandVersion {
    brand: string;
    version: string;
}

/**
 * CDP's `Emulation.UserAgentMetadata`: what `navigator.userAgentData` and the `Sec-CH-UA*` headers report. Every field
 * is set, because an override replaces the whole record and an omitted field would read empty.
 */
export interface UserAgentMetadata {
    brands: BrandVersion[];
    fullVersionList: BrandVersion[];
    /** Deprecated in CDP, yet a worker's `uaFullVersion` reads empty without it. */
    fullVersion: string;
    platform: string;
    platformVersion: string;
    architecture: string;
    model: string;
    mobile: boolean;
    bitness: string;
    wow64: boolean;
    formFactors: string[];
}

/** The parameters of `Emulation.setUserAgentOverride`. */
export interface UserAgentOverride {
    userAgent: string;
    userAgentMetadata: UserAgentMetadata;
}

/** The brand Google Chrome adds to the lists; Chrome for Testing is built with Chromium branding and has none. */
const CHROME_BRAND = 'Google Chrome';
/** The characters a GREASE brand is made of, in Chromium's order. */
const GREASE_CHARS = [' ', '(', ':', '-', '.', '/', ')', ';', '=', '?', '_'];
/** The versions a GREASE brand carries, in Chromium's order. */
const GREASE_VERSIONS = ['8', '99', '24'];
/** The stable permutations of a three-brand list, indexed by the major version (`GetRandomOrder`). */
const THREE_BRAND_ORDERS = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
];

/**
 * Turns the identity Chrome for Testing reports into Google Chrome's: the same user agent string, platform, versions
 * and hardware, and the brand lists real Chrome of the same version sends, with `Google Chrome`
 * among them. The lists are a port of `GenerateBrandVersionList` in Chromium's
 * `components/embedder_support/user_agent_utils.cc` (checked at 157.0.8103.78 against installed Google Chrome 157,
 * whose user agent string and every other field equal Chrome for Testing's; a bump of the pinned Chrome for Testing
 * version re-checks it).
 * @__NO_SIDE_EFFECTS__
 */
export function buildChromeBrand(userAgent: string, browserMetadata: UserAgentMetadata): UserAgentOverride {
    const fullVersion = browserMetadata.fullVersion;
    const major = Number.parseInt(fullVersion, 10);
    return {
        userAgent,
        userAgentMetadata: {
            ...browserMetadata,
            brands: generateBrandList(major, String(major), false),
            fullVersionList: generateBrandList(major, fullVersion, true),
        },
    };
}

/**
 * Chromium's list: a GREASE brand, Chromium and Google Chrome, shuffled by a permutation the major version picks.
 * `fullVersion` gives the GREASE brand a full version (`99.0.0.0`), as `fullVersionList` carries it.
 */
function generateBrandList(major: number, version: string, fullVersion: boolean) {
    const greaseVersion = GREASE_VERSIONS[major % GREASE_VERSIONS.length] ?? '';
    const list: BrandVersion[] = [
        {
            brand: `Not${GREASE_CHARS[major % GREASE_CHARS.length]}A${GREASE_CHARS[(major + 1) % GREASE_CHARS.length]}Brand`,
            version: fullVersion ? `${greaseVersion}.0.0.0` : greaseVersion,
        },
        { brand: 'Chromium', version },
        { brand: CHROME_BRAND, version },
    ];
    const order = THREE_BRAND_ORDERS[major % THREE_BRAND_ORDERS.length] ?? [];
    const shuffled: BrandVersion[] = [];
    for (const [index, item] of list.entries()) {
        shuffled[order[index] ?? index] = item;
    }
    return shuffled;
}
