/**
 * Test plugin for `compileFunction`'s `plugins` option: answers the `fixture:greeting` specifier with a
 * module exporting `options.greeting`, or fails the build when `options.fail` is set.
 */
export function greetingPlugin(options) {
    return {
        name: 'fixture-greeting',
        buildStart() {
            if (options.fail) {
                this.error('fixture plugin failed on purpose');
            }
        },
        resolveId: {
            order: 'pre',
            handler(source) {
                return source === 'fixture:greeting' ? '\0fixture-greeting' : null;
            },
        },
        load: {
            order: 'pre',
            handler(id) {
                return id === '\0fixture-greeting'
                    ? `export const greeting = ${JSON.stringify(options.greeting)};\n`
                    : null;
            },
        },
    };
}
