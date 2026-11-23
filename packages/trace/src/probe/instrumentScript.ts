import { Visitor, parseSync } from 'oxc-parser';
import type { ArrowFunctionExpression, Function as FunctionNode, FunctionBody } from 'oxc-parser';

/** Parameters of {@link instrumentScript}. */
export interface InstrumentScriptParams {
    /** JavaScript module source. */
    code: string;
    /** Used only in parser diagnostics. */
    filename: string;
    /**
     * The file id to record for code at `offset` (UTF-16) in `code`, or `undefined` when that code
     * is not traced (a dependency, or generated code with no source).
     */
    fileIdAt: (offset: number) => number | undefined;
}

/**
 * Inserts a `__nzymeTraceHit(fileId)` call at the entry of every function in a JavaScript module, so
 * each call records the source file the function came from. Returns `undefined` when the code does
 * not parse as a module; the caller runs it unchanged.
 *
 * Only text is inserted, never a newline, so line numbers in stack traces stay valid. Semantics are
 * preserved: a block body gets the call as its first statement after the directive prologue (a
 * `'use strict'` stays a directive), an expression-bodied arrow `x => e` becomes
 * `x => (__nzymeTraceHit(id), e)`, and the call reads no `this`, `arguments` or parameter. A
 * generator records on its first `next()`, when its body starts. `Function.prototype.toString`
 * returns the instrumented text.
 * @__NO_SIDE_EFFECTS__
 */
export function instrumentScript(params: InstrumentScriptParams): string | undefined {
    const { code, filename, fileIdAt } = params;
    const { program, errors } = parseSync(filename, code, { sourceType: 'module', lang: 'js' });
    if (errors.length > 0) {
        return undefined;
    }

    const inserts: Insert[] = [];
    new Visitor({
        FunctionDeclaration: instrumentFunction,
        FunctionExpression: instrumentFunction,
        ArrowFunctionExpression: instrumentFunction,
    }).visit(program);

    if (inserts.length === 0) {
        return code;
    }

    inserts.sort((a, b) => a.at - b.at);
    let result = '';
    let position = 0;
    for (const insert of inserts) {
        result += code.slice(position, insert.at) + insert.text;
        position = insert.at;
    }
    return result + code.slice(position);

    function instrumentFunction(node: FunctionNode | ArrowFunctionExpression) {
        const body = node.body;
        if (body === null) {
            // A declaration without a body (`declare function`) does not occur in JavaScript.
            return;
        }

        const fileId = fileIdAt(node.start) ?? fileIdAt(body.start);
        if (fileId === undefined) {
            return;
        }

        const hit = `__nzymeTraceHit(${fileId})`;
        if (body.type === 'BlockStatement') {
            inserts.push(blockBodyInsert(body, hit));
        } else {
            inserts.push({ at: body.start, text: `(${hit},` }, { at: body.end, text: ')' });
        }
    }
}

interface Insert {
    at: number;
    text: string;
}

/**
 * The call goes after the directive prologue, so the directives stay directives. Behind a directive
 * it is prefixed with `;`: a directive may end without a semicolon.
 */
function blockBodyInsert(body: FunctionBody, hit: string): Insert {
    let lastDirectiveEnd: number | undefined;
    for (const statement of body.body) {
        if (statement.type !== 'ExpressionStatement' || typeof statement.directive !== 'string') {
            break;
        }
        lastDirectiveEnd = statement.end;
    }

    return lastDirectiveEnd === undefined
        ? { at: body.start + 1, text: `${hit};` }
        : { at: lastDirectiveEnd, text: `;${hit};` };
}
