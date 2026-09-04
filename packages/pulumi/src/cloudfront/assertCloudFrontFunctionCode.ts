import { parseSync, traverse } from '@babel/core';
import type { NodePath } from '@babel/core';

import { assert } from '@nzyme/utils/assert.js';

import { cloudFrontRuntime } from './cloudFrontRuntime.js';

/**
 * Fails the build when a CloudFront Function bundle reaches for something `cloudfront-js-2.0` does
 * not have, or outgrows the hard 10 240 byte limit.
 *
 * Runs on the FINAL, minified bundle and works on the AST rather than on text: the `Map`/`Set`
 * spellings in a Babel iterable helper are string literals, and a text search would reject every
 * function we ship today. Scope information is what separates a free `Set` from a local named `Set`.
 *
 * @param code Final function code, exactly as it will be uploaded.
 * @param source Where the code came from, used in the error message.
 */
export function assertCloudFrontFunctionCode(code: string, source: string) {
    const problems = new Map<string, string>();

    function report(node: { loc?: { start: { line: number } } | null }, message: string) {
        if (!problems.has(message)) {
            const line = node.loc?.start.line;
            problems.set(message, line != null ? `line ${line}: ${message}` : message);
        }
    }

    const bytes = Buffer.byteLength(code, 'utf8');
    if (bytes > cloudFrontRuntime.maxFunctionBytes) {
        problems.set(
            'size',
            `bundle is ${bytes} bytes, over the ${cloudFrontRuntime.maxFunctionBytes} byte CloudFront Functions limit`,
        );
    }

    const ast = parseSync(code, {
        babelrc: false,
        configFile: false,
        sourceType: 'script',
        filename: source,
    });
    assert(ast, `Could not parse the compiled CloudFront Function ${source}`);

    traverse(ast, {
        ReferencedIdentifier(path) {
            const name = path.node.name;
            if (path.scope.hasBinding(name, { noGlobals: true })) {
                return;
            }

            if (name === 'require' && isAllowedRequire(path)) {
                return;
            }

            if (!Object.hasOwn(cloudFrontRuntime.globals, name)) {
                report(path.node, `\`${name}\` is not available in the runtime`);
            }
        },
        CallExpression(path) {
            const callee = path.get('callee');
            if (!callee.isMemberExpression() || callee.node.computed) {
                return;
            }

            const property = callee.get('property');
            if (!property.isIdentifier()) {
                return;
            }

            const method = property.node.name;
            const object = callee.get('object');
            if (object.isIdentifier() && !object.scope.hasBinding(object.node.name, { noGlobals: true })) {
                const statics = Object.hasOwn(cloudFrontRuntime.statics, object.node.name)
                    ? cloudFrontRuntime.statics[object.node.name]
                    : undefined;
                if (statics) {
                    if (!Object.hasOwn(statics, method)) {
                        report(property.node, `\`${object.node.name}.${method}()\` is not available in the runtime`);
                    }

                    return;
                }
            }

            // `Object.hasOwn` guards against `constructor`/`toString` resolving off the prototype.
            const replacement = Object.hasOwn(cloudFrontRuntime.missingMethods, method)
                ? cloudFrontRuntime.missingMethods[method]
                : undefined;
            if (replacement) {
                report(property.node, `\`.${method}()\` is not available in the runtime — ${replacement}`);
            }
        },
        Function(path) {
            if ('generator' in path.node && path.node.generator) {
                report(path.node, 'generator functions are not supported by the runtime');
            }
        },
        ForOfStatement(path) {
            if (path.node.await) {
                report(path.node, '`for await` is not supported by the runtime');
            }
        },
        YieldExpression(path) {
            report(path.node, '`yield` is not supported by the runtime');
        },
    });

    if (problems.size) {
        throw new Error(
            `CloudFront Function ${source} cannot run on cloudfront-js-2.0:\n` +
                [...problems.values()].map(problem => `  - ${problem}`).join('\n') +
                `\nThe runtime is an allowlist: ${cloudFrontRuntime.docUrl} (read ${cloudFrontRuntime.docReadOn})`,
        );
    }
}

/** `require` exists only to load the three built-in modules; anything else is a bundling mistake. */
function isAllowedRequire(path: NodePath) {
    const parent = path.parentPath;
    if (!parent?.isCallExpression() || parent.node.callee !== path.node) {
        return false;
    }

    const [argument] = parent.node.arguments;

    return argument?.type === 'StringLiteral' && cloudFrontRuntime.modules.includes(argument.value);
}
