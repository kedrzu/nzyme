import { template, types } from '@babel/core';
import type { NodePath, PluginObject } from '@babel/core';

/**
 * A single sugar method the `cloudfront-js-2.0` runtime lacks, together with the ES5 replacement
 * injected in its place.
 */
interface CloudFrontMethodHelper {
    /**
     * How many arguments of the original call the helper declares. A call with more arguments is
     * left alone so the final-bundle check reports it, rather than the plugin silently dropping
     * them. Ignored when {@link variadic} is set.
     */
    argumentCount: number;
    /** Set when the helper reads its arguments through `arguments` and takes any number of them. */
    variadic?: boolean;
    /**
     * ES5 source of the helper. `%%name%%` is the helper itself, `%%fallback%%` the shared
     * dynamic-dispatch helper used when the receiver is not the type the fast path handles.
     */
    source: string;
}

/** Not a valid method name, so it cannot collide with a key of the tables below. */
const FALLBACK_KEY = '@fallback';

/**
 * Shared fallback. It looks the method up with a computed member access on purpose: the original
 * `target.toSorted(...)` form would be flagged by the final-bundle check, and on this runtime the
 * lookup throws exactly as an unrewritten call would have.
 */
const FALLBACK_HELPER = `
    function %%name%%(target, method, args) {
        return target[method].apply(target, args);
    }
`;

/**
 * Instance methods rewritten on any receiver. The receiver type is unknowable here, so every helper
 * guards on `Array.isArray` (plus `typeof === "string"` for `at`) and otherwise defers to
 * {@link FALLBACK_HELPER}.
 */
const METHOD_HELPERS: Record<string, CloudFrontMethodHelper> = {
    toSorted: {
        argumentCount: 1,
        source: `
            function %%name%%(target, compare) {
                if (!Array.isArray(target)) return %%fallback%%(target, "toSorted", [compare]);
                return target.slice().sort(compare);
            }
        `,
    },
    toReversed: {
        argumentCount: 0,
        source: `
            function %%name%%(target) {
                if (!Array.isArray(target)) return %%fallback%%(target, "toReversed", []);
                return target.slice().reverse();
            }
        `,
    },
    toSpliced: {
        argumentCount: 0,
        variadic: true,
        source: `
            function %%name%%(target) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (!Array.isArray(target)) return %%fallback%%(target, "toSpliced", args);
                var copy = target.slice();
                copy.splice.apply(copy, args);
                return copy;
            }
        `,
    },
    with: {
        argumentCount: 2,
        source: `
            function %%name%%(target, index, value) {
                if (!Array.isArray(target)) return %%fallback%%(target, "with", [index, value]);
                var offset = Math.trunc(index) || 0;
                if (offset < 0) offset += target.length;
                if (offset < 0 || offset >= target.length) throw new RangeError("Invalid index");
                var copy = target.slice();
                copy[offset] = value;
                return copy;
            }
        `,
    },
    at: {
        argumentCount: 1,
        source: `
            function %%name%%(target, index) {
                if (!Array.isArray(target) && typeof target !== "string") {
                    return %%fallback%%(target, "at", [index]);
                }
                var offset = Math.trunc(index) || 0;
                if (offset < 0) offset += target.length;
                if (offset < 0 || offset >= target.length) return undefined;
                return target[offset];
            }
        `,
    },
    flat: {
        argumentCount: 1,
        source: `
            function %%name%%(target, depth) {
                if (!Array.isArray(target)) return %%fallback%%(target, "flat", [depth]);
                var remaining = depth === undefined ? 1 : Number(depth);
                var result = [];
                for (var i = 0; i < target.length; i++) {
                    var item = target[i];
                    if (Array.isArray(item) && remaining > 0) {
                        result = result.concat(%%name%%(item, remaining - 1));
                    } else {
                        result.push(item);
                    }
                }
                return result;
            }
        `,
    },
    flatMap: {
        argumentCount: 2,
        source: `
            function %%name%%(target, callback, thisArg) {
                if (!Array.isArray(target)) return %%fallback%%(target, "flatMap", [callback, thisArg]);
                var result = [];
                for (var i = 0; i < target.length; i++) {
                    var mapped = callback.call(thisArg, target[i], i, target);
                    if (Array.isArray(mapped)) {
                        result = result.concat(mapped);
                    } else {
                        result.push(mapped);
                    }
                }
                return result;
            }
        `,
    },
    findLast: {
        argumentCount: 2,
        source: `
            function %%name%%(target, predicate, thisArg) {
                if (!Array.isArray(target)) return %%fallback%%(target, "findLast", [predicate, thisArg]);
                for (var i = target.length - 1; i >= 0; i--) {
                    if (predicate.call(thisArg, target[i], i, target)) return target[i];
                }
                return undefined;
            }
        `,
    },
    findLastIndex: {
        argumentCount: 2,
        source: `
            function %%name%%(target, predicate, thisArg) {
                if (!Array.isArray(target)) {
                    return %%fallback%%(target, "findLastIndex", [predicate, thisArg]);
                }
                for (var i = target.length - 1; i >= 0; i--) {
                    if (predicate.call(thisArg, target[i], i, target)) return i;
                }
                return -1;
            }
        `,
    },
};

/**
 * `Object` statics the runtime lacks. Rewritten only when `Object` is the real global, never a local
 * binding that happens to be called `Object`. `fromEntries` takes an array of pairs — the runtime
 * has no iterators to spread anyway.
 */
const OBJECT_STATIC_HELPERS: Record<string, CloudFrontMethodHelper> = {
    fromEntries: {
        argumentCount: 1,
        source: `
            function %%name%%(entries) {
                var result = {};
                for (var i = 0; i < entries.length; i++) {
                    result[entries[i][0]] = entries[i][1];
                }
                return result;
            }
        `,
    },
    hasOwn: {
        argumentCount: 2,
        source: `
            function %%name%%(target, key) {
                return Object.prototype.hasOwnProperty.call(target, key);
            }
        `,
    },
};

const helperNamesByProgram = new WeakMap<object, Map<string, string>>();

/**
 * Babel plugin that replaces the ES2015+ sugar methods listed in the runtime model with ES5 helpers.
 * `@babel/preset-env` only downlevels syntax, so without this a `toSorted` survives the build, the
 * lint and the deploy, and fails at the edge with a 503.
 *
 * Helpers are injected once per module and only when used, so a bundle that touches none of these
 * methods does not grow a byte.
 */
export function cloudFrontMethodsPlugin(): PluginObject {
    return {
        name: 'cloudfront-methods',
        visitor: {
            CallExpression(path) {
                const callee = path.get('callee');
                if (!callee.isMemberExpression() || callee.node.computed) {
                    return;
                }

                const property = callee.get('property');
                if (!property.isIdentifier()) {
                    return;
                }

                const object = callee.get('object');
                const isObjectGlobal =
                    object.isIdentifier({ name: 'Object' }) && !object.scope.hasBinding('Object', { noGlobals: true });

                if (isObjectGlobal) {
                    replaceWithHelper(path, property.node.name, OBJECT_STATIC_HELPERS, []);
                    return;
                }

                const receiver = callee.get('object');
                if (receiver.isExpression()) {
                    replaceWithHelper(path, property.node.name, METHOD_HELPERS, [receiver.node]);
                }
            },
        },
    };
}

function replaceWithHelper(
    path: NodePath<types.CallExpression>,
    method: string,
    helpers: Record<string, CloudFrontMethodHelper>,
    leadingArgs: types.Expression[],
) {
    // `Object.hasOwn`, because a method named `constructor` or `toString` would otherwise resolve
    // through the prototype chain of the lookup table.
    if (!Object.hasOwn(helpers, method)) {
        return;
    }

    const helper = helpers[method];
    if (!helper) {
        return;
    }

    const args = path.node.arguments;
    // Anything that could shift or grow the helper's fixed parameter list is left for the
    // final-bundle check to report, rather than silently miscompiled here.
    if (!helper.variadic && args.length > helper.argumentCount) {
        return;
    }

    if (args.some(arg => types.isSpreadElement(arg))) {
        return;
    }

    const name = ensureHelper(path, method, helper);
    path.replaceWith(types.callExpression(types.identifier(name), [...leadingArgs, ...args]));
}

function ensureHelper(path: NodePath<types.CallExpression>, method: string, helper: CloudFrontMethodHelper) {
    const programPath = path.scope.getProgramParent().path;
    if (!programPath.isProgram()) {
        throw new Error('Expected the program scope to be anchored on a Program node');
    }

    let helperNames = helperNamesByProgram.get(programPath);
    if (!helperNames) {
        helperNames = new Map();
        helperNamesByProgram.set(programPath, helperNames);
    }

    const existing = helperNames.get(method);
    if (existing) {
        return existing;
    }

    const name = programPath.scope.generateUid(`cf_${method}`);
    helperNames.set(method, name);

    const substitutions: Record<string, types.Identifier> = { name: types.identifier(name) };
    if (helper.source.includes('%%fallback%%')) {
        substitutions.fallback = types.identifier(ensureFallbackHelper(programPath, helperNames));
    }

    programPath.unshiftContainer('body', template.statement(helper.source)(substitutions));

    return name;
}

function ensureFallbackHelper(programPath: NodePath<types.Program>, helperNames: Map<string, string>) {
    const existing = helperNames.get(FALLBACK_KEY);
    if (existing) {
        return existing;
    }

    const name = programPath.scope.generateUid('cf_fallback');
    helperNames.set(FALLBACK_KEY, name);

    programPath.unshiftContainer('body', template.statement(FALLBACK_HELPER)({ name: types.identifier(name) }));

    return name;
}
