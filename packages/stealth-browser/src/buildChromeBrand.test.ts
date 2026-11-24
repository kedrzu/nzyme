import { expect, test } from 'bun:test';

import { buildChromeBrand } from './buildChromeBrand.js';
import type { UserAgentMetadata, UserAgentOverride } from './buildChromeBrand.js';

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

/** What Chrome for Testing 157.0.8103.78 reported on an Apple Silicon Mac (2026-11-16). */
const TESTING_157: UserAgentMetadata = {
    brands: [
        { brand: 'Chromium', version: '157' },
        { brand: 'Not-A.Brand', version: '99' },
    ],
    fullVersionList: [
        { brand: 'Chromium', version: '157.0.8103.78' },
        { brand: 'Not-A.Brand', version: '99.0.0.0' },
    ],
    fullVersion: '157.0.8103.78',
    platform: 'macOS',
    platformVersion: '26.6.2',
    architecture: 'arm',
    model: '',
    mobile: false,
    bitness: '64',
    wow64: false,
    formFactors: ['Desktop'],
};

test('gives Google Chrome 157 brand lists, exactly as installed Chrome 157 reports them, and keeps the rest', () => {
    const expected: UserAgentOverride = {
        userAgent: USER_AGENT,
        userAgentMetadata: {
            ...TESTING_157,
            brands: [
                { brand: 'Not-A.Brand', version: '99' },
                { brand: 'Google Chrome', version: '157' },
                { brand: 'Chromium', version: '157' },
            ],
            fullVersionList: [
                { brand: 'Not-A.Brand', version: '99.0.0.0' },
                { brand: 'Google Chrome', version: '157.0.8103.78' },
                { brand: 'Chromium', version: '157.0.8103.78' },
            ],
        },
    };

    expect(buildChromeBrand(USER_AGENT, TESTING_157)).toEqual(expected);
});
