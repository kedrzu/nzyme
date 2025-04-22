/**
 * Patches Node.js process.emit to suppress ExperimentalWarning and punycode DeprecationWarning
 */
export function patchNodeWarnings() {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalEmit = process.emit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patchedEmit = function (name: string, data: any) {
        if (name === `warning` && typeof data === `object`) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (data.name === 'ExperimentalWarning') {
                return false;
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            if (data.name === 'DeprecationWarning' && data.message.includes('punycode')) {
                return false;
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, prefer-rest-params, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        return originalEmit.apply(process, arguments as any) as any;
    };

    process.emit = patchedEmit as typeof process.emit;
}
