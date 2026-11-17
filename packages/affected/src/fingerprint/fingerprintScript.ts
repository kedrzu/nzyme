import { Visitor, parseSync } from 'oxc-parser';
import type { ArrowFunctionExpression, Expression, Function as FunctionNode, Program, Span } from 'oxc-parser';

import type { FileFingerprintResult } from './FileFingerprint.js';
import { getMd5Hash } from '@nzyme/crypto';

/** The source dialect a script is transpiled from. */
export type ScriptLoader = 'ts' | 'tsx' | 'js';

/**
 * TS loaders drop imports whose bindings are unused or used only as types, as the TypeScript
 * compiler does, so adding a type import changes nothing; a JS import always loads its module, so
 * the JS loader keeps every import. JSX is pinned to the classic factory: the automatic runtime
 * prints a generated helper name.
 */
const transpilers: Record<ScriptLoader, Bun.Transpiler> = {
    ts: new Bun.Transpiler({ loader: 'ts', trimUnusedImports: true }),
    tsx: new Bun.Transpiler({
        loader: 'tsx',
        trimUnusedImports: true,
        tsconfig: { compilerOptions: { jsx: 'react', jsxFactory: 'h', jsxFragmentFactory: 'Fragment' } },
    }),
    js: new Bun.Transpiler({ loader: 'js', trimUnusedImports: false }),
};

/**
 * Fingerprints a script module. The script is transpiled to JS, which strips types and comments and
 * reprints the code, so formatting is normalised too. `body` hashes the bodies of the outermost
 * functions (declarations, expressions, arrows, class and object methods); `top` hashes the rest of
 * the module, with those bodies replaced by `{}`.
 *
 * A function invoked where it is defined (an IIFE, which is also how TS emits enums and namespaces)
 * runs at load time, so its body stays in `top`; the functions declared inside it are split as usual.
 * @__NO_SIDE_EFFECTS__
 */
export function fingerprintScript(code: string, loader: ScriptLoader): FileFingerprintResult {
    let js: string;
    try {
        js = transpilers[loader].transformSync(code);
    } catch {
        // Bun reports a syntax error by throwing; such a file is fingerprinted by its bytes.
        return 'whole';
    }

    const { program, errors } = parseSync('script.js', js, { sourceType: 'module', lang: 'js' });
    if (errors.length > 0) {
        return 'whole';
    }

    const bodies = collectOutermostBodies(program);

    let top = '';
    let position = 0;
    const bodyTexts: string[] = [];
    for (const body of bodies) {
        top += js.slice(position, body.start) + '{}';
        bodyTexts.push(js.slice(body.start, body.end));
        position = body.end;
    }
    top += js.slice(position);

    return {
        body: getMd5Hash(bodyTexts.join('\0')),
        top: getMd5Hash(top),
    };
}

type FunctionLike = FunctionNode | ArrowFunctionExpression;

/** Spans of the outermost function bodies, in source order. */
function collectOutermostBodies(program: Program) {
    const bodies: Span[] = [];
    const invokedInPlace = new Set<FunctionLike>();
    let depth = 0;

    new Visitor({
        // A call is visited before its callee, so the IIFE is known by the time the walk enters it.
        CallExpression(node) {
            const callee = unwrapParentheses(node.callee);
            if (callee.type === 'FunctionExpression' || callee.type === 'ArrowFunctionExpression') {
                invokedInPlace.add(callee);
            }
        },
        FunctionDeclaration: enterFunction,
        'FunctionDeclaration:exit': exitFunction,
        FunctionExpression: enterFunction,
        'FunctionExpression:exit': exitFunction,
        ArrowFunctionExpression: enterFunction,
        'ArrowFunctionExpression:exit': exitFunction,
    }).visit(program);

    return bodies;

    function enterFunction(node: FunctionLike) {
        if (invokedInPlace.has(node)) {
            return;
        }

        if (depth === 0 && node.body) {
            bodies.push(node.body);
        }
        depth++;
    }

    function exitFunction(node: FunctionLike) {
        if (!invokedInPlace.has(node)) {
            depth--;
        }
    }
}

function unwrapParentheses(expression: Expression): Expression {
    let current = expression;
    while (current.type === 'ParenthesizedExpression') {
        current = current.expression;
    }
    return current;
}
