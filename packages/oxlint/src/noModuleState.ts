import type { Immutable } from '@nzyme/types/Immutable.js';

import { isNode } from './isNode.js';
import { findVariable, hasAnnotationInFile, isAnnotatedExport } from './noSideEffectsDeclaration.js';
import type {
    OxlintAnyNode,
    OxlintDefinition,
    OxlintIdentifier,
    OxlintMemberExpression,
    OxlintNode,
    OxlintRule,
    OxlintTsTypeAnnotation,
    OxlintVariableDeclaration,
} from './oxlintTypes.js';
import { resolveImportSpecifier } from './resolveImportSpecifier.js';
import { resolvePackageSpecifier } from './resolvePackageSpecifier.js';

const MESSAGES = {
    mutableBinding:
        '`{{kind}}` at module top level is state that outlives a call. Use `const`, or move the state into a declared factory such as `createMemo`/`createCache` from `@nzyme/utils`.',
    mutableValue:
        'A mutable {{what}} at module top level is state that outlives a call. Make it immutable all the way down (`as const`, or an `Immutable<…>` type from `@nzyme/types/Immutable.js`; `Object.freeze(…)` and the `Readonly*` types cover only the top level), or create it through a function annotated `@__NO_SIDE_EFFECTS__`.',
    undeclaredCall:
        '`{{name}}` is called at module top level but is not declared `@__NO_SIDE_EFFECTS__`. Annotate it if it is idempotent and tested, list its package in `externalPackages`, or call it lazily.',
    loadTimeEffect:
        'This statement runs when the module loads and can leave state behind. Move it into a function, or disable the rule here with a comment saying why the module must hold this state.',
    mutableStaticField:
        'A static class field that is not `readonly` is state that outlives a call. Make it `readonly` with an immutable value.',
    uninspectableItems:
        'The values this {{what}} keeps are built where this rule cannot see them, and its readonly type makes only the top level immutable. Build them from literals or existing constants, type the value `Immutable<…>` from `@nzyme/types/Immutable.js`, or create it through a function annotated `@__NO_SIDE_EFFECTS__`.',
} as const;

type MessageId = keyof typeof MESSAGES;

/**
 * How immutable the value at a position is made by what surrounds it, which decides whether an
 * object or array literal may sit there:
 * - `deep`: a declared `Immutable<…>` (`@nzyme/types`) makes TypeScript refuse writes to the value
 *   and to everything reached through it, whatever built it;
 * - `const`: `as const` makes TypeScript refuse writes to the literal and to every literal nested in
 *   it, but not to what a call returns there, nor to a part asserted to a mutable type
 *   (`{ a: [] as string[] } as const`);
 * - `shallow`: a declared `Readonly<…>` or `Object.freeze` refuses writes to the literal itself only,
 *   so a literal nested in it is `mutable` again;
 * - a collection constructor name: the position's declared type is that collection's readonly
 *   interface (`ReadonlyMap` for `Map`, `readonly T[]`), which is the only thing that stops `.set()` —
 *   `Readonly<Map>` does not, and `WeakMap`/`WeakSet` have no readonly interface at all. It is shallow
 *   too: the elements it holds are `mutable`.
 */
type Mutability = 'mutable' | 'shallow' | 'deep' | 'const' | 'Array' | 'Map' | 'Set';

/** Readonly type names, and how far each one makes a value immutable. */
const READONLY_TYPES: ReadonlyMap<string, Mutability> = new Map<string, Mutability>([
    ['Immutable', 'deep'],
    ['Readonly', 'shallow'],
    ['ReadonlyArray', 'Array'],
    ['ReadonlyMap', 'Map'],
    ['ReadonlySet', 'Set'],
]);

/**
 * How a value keeps the items an iterable yields: whole, as an array or `Set` element, or as an entry
 * pair whose halves it keeps (a `Map`, `Object.fromEntries`).
 */
type ItemRole = 'element' | 'entry';

/** Collections whose `new` is a mutable value unless its readonly interface is declared. */
const COLLECTION_CONSTRUCTORS: ReadonlySet<string> = new Set(['Array', 'Map', 'Set', 'WeakMap', 'WeakSet']);

/**
 * Global constructors whose instances hold configuration only: nothing a call does to one changes
 * what the next call gets back.
 */
const PURE_GLOBAL_CONSTRUCTORS: ReadonlySet<string> = new Set([
    'Bun.Transpiler',
    'Intl.Collator',
    'Intl.DateTimeFormat',
    'Intl.ListFormat',
    'Intl.NumberFormat',
    'Intl.PluralRules',
    'Intl.RelativeTimeFormat',
]);

/** Global functions that return a fresh primitive and touch nothing else. */
const PRIMITIVE_GLOBAL_CALLS: ReadonlySet<string> = new Set([
    'BigInt',
    'Boolean',
    'Number',
    'String',
    'Symbol',
    'parseFloat',
    'parseInt',
]);

/** `Global.method` calls that return a fresh primitive (or a registry symbol) and touch nothing else. */
const PRIMITIVE_STATIC_CALLS: ReadonlySet<string> = new Set([
    'JSON.stringify',
    'Number.parseFloat',
    'Number.parseInt',
    'String.raw',
    'Symbol.for',
]);

/**
 * `Global.method` calls that build a fresh object or array from their arguments and touch nothing
 * else. The result is mutable, so it is allowed only where a declared readonly type or
 * `Object.freeze` makes it immutable (`as const` does not reach a call), and below a shallow one the
 * items it keeps must be immutable on their own.
 */
const FRESH_OBJECT_STATIC_CALLS: ReadonlySet<string> = new Set([
    'Array.from',
    'Array.of',
    'Object.entries',
    'Object.fromEntries',
    'Object.keys',
    'Object.values',
]);

/** Top-level statements that declare or import, and run nothing of their own when the module loads. */
const INERT_STATEMENTS: ReadonlySet<string> = new Set([
    'EmptyStatement',
    'ExportAllDeclaration',
    'FunctionDeclaration',
    'ImportDeclaration',
    'TSDeclareFunction',
    'TSEnumDeclaration',
    'TSImportEqualsDeclaration',
    'TSInterfaceDeclaration',
    'TSNamespaceExportDeclaration',
    'TSTypeAliasDeclaration',
]);

/** Expressions that only wrap their operand for the type checker. */
const TYPE_WRAPPERS: ReadonlySet<string> = new Set([
    'ParenthesizedExpression',
    'TSInstantiationExpression',
    'TSNonNullExpression',
    'TSSatisfiesExpression',
]);

/** A specifier is resolved as written first, then as a workspace package's source. */
function resolveSourceSpecifier(fromFile: string, specifier: string): string | undefined {
    return resolveImportSpecifier(fromFile, specifier) ?? resolvePackageSpecifier(fromFile, specifier);
}

/**
 * Rejects module-level state that nobody declared.
 *
 * Test selection by recorded execution assumes that state shared between tests lives only in
 * declared places: a cache filled lazily by one test and read by the next would let the second
 * test's trace miss the code that produced its data. So at module top level only what cannot hold
 * such state is allowed — functions, primitives, values made immutable — plus calls the author
 * vouched for with `@__NO_SIDE_EFFECTS__` (idempotent and tested), read from the callee's own
 * declaration across module and package boundaries, and calls into the configured external packages
 * that cannot carry the annotation. Only the outermost call of an initialiser is judged: its
 * arguments are inputs to a declared factory, not state of their own.
 *
 * Options: `{ externalPackages: string[] }` — packages whose functions may be called (or classes
 * constructed) at top level although nothing here can read an annotation from them (`zod`,
 * `drizzle-orm/pg-core`). An entry covers the specifier itself, every subpath below it, and every
 * call chained onto a call into it (`z.string().min(1)`); `pkg#name` narrows it to one export.
 */
export const noModuleState: Immutable<OxlintRule> = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow mutable state at module top level, other than through functions declared `@__NO_SIDE_EFFECTS__`.',
        },
        messages: MESSAGES,
        schema: [
            {
                type: 'object',
                properties: { externalPackages: { type: 'array', items: { type: 'string' } } },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const externalPackages = readExternalPackages(context.options[0]);

        return {
            Program(program) {
                checkStatements(program.body);
            },
        };

        function report(node: OxlintNode, messageId: MessageId, data?: Record<string, string>): void {
            context.report({ node, messageId, data });
        }

        function checkStatements(statements: OxlintNode[]): void {
            for (const statement of statements) {
                checkStatement(statement);
            }
        }

        function checkStatement(statement: OxlintNode): void {
            if (INERT_STATEMENTS.has(statement.type)) {
                return;
            }

            if (isNode(statement, 'VariableDeclaration')) {
                checkVariableDeclaration(statement);
                return;
            }

            const node: OxlintAnyNode = statement;
            switch (node.type) {
                case 'ClassDeclaration':
                    checkClass(node);
                    return;
                case 'ExportNamedDeclaration':
                    if (node.declaration != null) {
                        checkStatement(node.declaration);
                    }
                    return;
                case 'ExportDefaultDeclaration':
                    if (node.declaration != null) {
                        checkDefaultExport(node.declaration);
                    }
                    return;
                case 'TSModuleDeclaration':
                    // `declare module`/`declare global` only describe types; a real namespace runs.
                    if (!node.declare && node.body != null && !Array.isArray(node.body)) {
                        const block: OxlintAnyNode = node.body;
                        if (Array.isArray(block.body)) {
                            checkStatements(block.body);
                        }
                    }
                    return;
                case 'TSExportAssignment':
                    if (node.expression != null) {
                        checkValue(node.expression, 'mutable');
                    }
                    return;
                case 'ExpressionStatement':
                    // `'use strict'` and friends.
                    if (node.directive != null) {
                        return;
                    }
                    report(statement, 'loadTimeEffect');
                    return;
                default:
                    report(statement, 'loadTimeEffect');
            }
        }

        function checkDefaultExport(declaration: OxlintNode): void {
            switch (declaration.type) {
                case 'FunctionDeclaration':
                case 'TSDeclareFunction':
                case 'TSInterfaceDeclaration':
                    return;
                case 'ClassDeclaration':
                    checkClass(declaration);
                    return;
                default:
                    checkValue(declaration, 'mutable');
            }
        }

        function checkVariableDeclaration(declaration: OxlintVariableDeclaration): void {
            if (declaration.declare === true) {
                return;
            }

            if (declaration.kind !== 'const') {
                report(declaration, 'mutableBinding', { kind: declaration.kind });
                return;
            }

            for (const declarator of declaration.declarations) {
                if (declarator.init != null) {
                    checkValue(declarator.init, mutabilityOfAnnotation(declarator.id.typeAnnotation));
                }
            }
        }

        function checkClass(node: OxlintAnyNode): void {
            if (node.superClass != null) {
                checkValue(node.superClass, 'deep');
            }

            const body: OxlintAnyNode | undefined = Array.isArray(node.body) ? undefined : (node.body ?? undefined);
            if (body == null || !Array.isArray(body.body)) {
                return;
            }

            for (const element of body.body) {
                checkClassElement(element);
            }
        }

        function checkClassElement(element: OxlintNode): void {
            const node: OxlintAnyNode = element;
            if (node.type === 'StaticBlock') {
                report(element, 'loadTimeEffect');
                return;
            }

            // Methods and index signatures hold nothing until called; instance fields live per instance.
            const isField = node.type === 'PropertyDefinition' || node.type === 'AccessorProperty';
            if (!isField || node.static !== true || node.declare === true) {
                return;
            }

            if (node.readonly !== true) {
                report(element, 'mutableStaticField');
                return;
            }

            if (node.value != null) {
                checkValue(node.value, mutabilityOfAnnotation(node.typeAnnotation));
            }
        }

        /**
         * Checks a value held at module level. `mutability` says what around it already makes
         * TypeScript refuse writes to it, which is what an object, array or collection needs.
         */
        function checkValue(value: OxlintNode, mutability: Mutability): void {
            const node: OxlintAnyNode = value;

            if (TYPE_WRAPPERS.has(node.type) && node.expression != null) {
                checkValue(node.expression, mutability);
                return;
            }

            switch (node.type) {
                case 'Identifier':
                case 'Literal':
                case 'ThisExpression':
                case 'MetaProperty':
                case 'Super':
                case 'ArrowFunctionExpression':
                case 'FunctionExpression':
                    return;
                case 'TemplateLiteral':
                    checkEach(node.expressions, mutability);
                    return;
                case 'TSAsExpression':
                case 'TSTypeAssertion':
                    if (node.expression != null) {
                        const asserted =
                            node.typeAnnotation == null ? 'mutable' : mutabilityOfType(node.typeAnnotation);
                        checkValue(node.expression, assertedMutability(mutability, asserted));
                    }
                    return;
                case 'UnaryExpression':
                    checkOptional(node.argument, mutability);
                    return;
                case 'BinaryExpression':
                case 'LogicalExpression':
                    checkOptional(node.left, mutability);
                    checkOptional(node.right, mutability);
                    return;
                case 'ConditionalExpression':
                    checkOptional(node.test, mutability);
                    checkOptional(node.consequent, mutability);
                    checkOptional(node.alternate, mutability);
                    return;
                case 'MemberExpression':
                    // Reading a property stores nothing new; only what is evaluated to get there counts.
                    checkOptional(node.object, 'deep');
                    if (node.computed === true) {
                        checkOptional(node.property, 'deep');
                    }
                    return;
                case 'ChainExpression':
                    checkOptional(node.expression, mutability);
                    return;
                case 'ClassExpression':
                    checkClass(node);
                    return;
                case 'ObjectExpression':
                    if (mutability === 'mutable') {
                        report(value, 'mutableValue', { what: 'object' });
                        return;
                    }
                    checkEach(node.properties, nestedMutability(mutability));
                    return;
                case 'ArrayExpression':
                    if (mutability === 'mutable') {
                        report(value, 'mutableValue', { what: 'array' });
                        return;
                    }
                    checkEach(node.elements, nestedMutability(mutability));
                    return;
                case 'Property':
                    // Reached through the object's properties: `mutability` is already the nested one.
                    if (node.computed === true) {
                        checkOptional(node.key, 'deep');
                    }
                    checkOptional(node.value, mutability);
                    return;
                case 'SpreadElement':
                    checkOptional(node.argument, mutability);
                    return;
                case 'NewExpression':
                    checkNew(node, mutability);
                    return;
                case 'CallExpression':
                    checkCall(node, mutability);
                    return;
                case 'TaggedTemplateExpression':
                    if (node.tag != null && !isAllowedCallee(node.tag)) {
                        report(value, 'undeclaredCall', { name: calleeName(node.tag) });
                    }
                    return;
                default:
                    // `await`, assignments, updates, sequences, `import()`, JSX, `yield`: each either
                    // runs something at load or builds a value nothing here can prove immutable.
                    report(value, 'loadTimeEffect');
            }
        }

        function checkEach(nodes: (OxlintNode | null)[] | undefined, mutability: Mutability): void {
            for (const node of nodes ?? []) {
                checkOptional(node, mutability);
            }
        }

        function checkOptional(node: OxlintNode | null | undefined, mutability: Mutability): void {
            if (node != null) {
                checkValue(node, mutability);
            }
        }

        function checkNew(node: OxlintAnyNode, mutability: Mutability): void {
            const callee = node.callee;
            if (callee == null) {
                return;
            }

            if (isGlobalIdentifier(callee) && COLLECTION_CONSTRUCTORS.has(callee.name)) {
                const what = `\`${callee.name}\``;
                if (mutability !== callee.name) {
                    report(node, 'mutableValue', { what });
                } else if (callee.name === 'Array') {
                    // `new Array(a, b)` keeps its arguments as elements; `new Array(n)` only a length.
                    checkEach(node.arguments, 'mutable');
                } else {
                    // A readonly collection interface is shallow: the values it keeps are `mutable`.
                    checkItems({ owner: node, what, iterable: node.arguments?.[0], role: itemRoleOf(callee.name) });
                }
                return;
            }

            const staticName = globalStaticCallName(callee);
            if (staticName != null && PURE_GLOBAL_CONSTRUCTORS.has(staticName)) {
                return;
            }

            const root = chainRoot(callee);
            if (root != null && isExternal(importOf(root))) {
                return;
            }

            report(node, 'undeclaredCall', { name: `new ${calleeName(callee)}` });
        }

        function checkCall(node: OxlintAnyNode, mutability: Mutability): void {
            const callee = node.callee;
            if (callee == null) {
                return;
            }

            if (isGlobalMember(callee, 'Object', 'freeze')) {
                for (const argument of node.arguments ?? []) {
                    checkValue(argument, mutability === 'deep' ? 'deep' : 'shallow');
                }
                return;
            }

            const staticName = globalStaticCallName(callee);
            if (staticName != null && FRESH_OBJECT_STATIC_CALLS.has(staticName)) {
                checkFreshObjectCall(node, staticName, mutability);
                return;
            }

            if (!isAllowedCallee(callee)) {
                report(node, 'undeclaredCall', { name: calleeName(callee) });
            }
        }

        function checkFreshObjectCall(node: OxlintAnyNode, name: string, mutability: Mutability): void {
            const what = `\`${name}\` result`;
            if (mutability === 'mutable' || mutability === 'const') {
                report(node, 'mutableValue', { what });
                return;
            }

            // A declared `Immutable<…>` type refuses writes to everything the call builds.
            if (mutability === 'deep') {
                return;
            }

            if (name === 'Object.fromEntries') {
                checkItems({ owner: node, what, iterable: node.arguments?.[0], role: 'entry' });
            } else {
                checkItems({ owner: node, what, iterable: node, role: 'element' });
            }
        }

        /**
         * Checks the items a value under a shallow readonly type keeps from `iterable` — each item, or
         * what `mapper` returns for it — as `mutable` positions: the readonly type refuses writes to the
         * value, not to its items. Items read from an existing binding are as immutable as its own
         * declaration made them; an item built where this rule cannot see it is reported.
         */
        function checkItems(params: CheckItemsParams): void {
            const { owner, what, iterable, mapper } = params;
            if (mapper != null) {
                const returned = returnedExpression(mapper);
                if (returned == null) {
                    report(owner, 'uninspectableItems', { what });
                } else {
                    checkItem(params, returned);
                }
                return;
            }

            if (iterable == null) {
                return;
            }

            const node: OxlintAnyNode = iterable;
            switch (node.type) {
                case 'Identifier':
                case 'MemberExpression':
                case 'Literal':
                case 'TemplateLiteral':
                    return;
                case 'ParenthesizedExpression':
                case 'TSAsExpression':
                case 'TSInstantiationExpression':
                case 'TSNonNullExpression':
                case 'TSSatisfiesExpression':
                case 'TSTypeAssertion':
                    // The value's declared type, not an assertion on its iterable, decides what its items are.
                    checkItems({ ...params, iterable: unwrapAssertions(node) });
                    return;
                case 'ArrayExpression':
                    for (const element of node.elements ?? []) {
                        const item: OxlintAnyNode | null = element;
                        if (item?.type === 'SpreadElement') {
                            checkItems({ ...params, iterable: item.argument ?? undefined });
                        } else if (element != null) {
                            checkItem(params, element);
                        }
                    }
                    return;
                case 'ObjectExpression':
                    // An array-like — `{ length: 2 }` — yields its indexed property values.
                    checkEach(node.properties, 'mutable');
                    return;
                case 'CallExpression':
                    checkCallItems(params, node);
                    return;
                default:
                    report(owner, 'uninspectableItems', { what });
            }
        }

        /** The items an iterable built by a call yields, for the calls whose items can be told. */
        function checkCallItems(params: CheckItemsParams, call: OxlintAnyNode): void {
            const { owner, what, role } = params;
            const callee = call.callee;
            const [first, second] = call.arguments ?? [];

            // `list.map(item => …)` yields what its callback returns.
            if (callee != null && isNode(callee, 'MemberExpression') && isNamedMember(callee, 'map')) {
                checkItems({ ...params, iterable: undefined, mapper: first });
                return;
            }

            // `list.flatMap(item => …)` yields the items of what its callback returns.
            if (callee != null && isNode(callee, 'MemberExpression') && isNamedMember(callee, 'flatMap')) {
                const returned = first == null ? undefined : returnedExpression(first);
                if (returned == null) {
                    report(owner, 'uninspectableItems', { what });
                } else {
                    checkItems({ ...params, iterable: returned });
                }
                return;
            }

            switch (callee == null ? undefined : globalStaticCallName(callee)) {
                case 'Object.keys':
                    // Keys are strings.
                    return;
                case 'Array.of':
                    for (const argument of call.arguments ?? []) {
                        checkItem(params, argument);
                    }
                    return;
                case 'Array.from':
                    checkItems({ ...params, iterable: first, mapper: second });
                    return;
                case 'Object.values':
                    checkObjectValues(params, first);
                    return;
                case 'Object.entries':
                    // Each entry is a fresh pair: kept whole it is a mutable array, read as an entry only
                    // its value is kept.
                    if (role === 'entry') {
                        checkObjectValues(params, first);
                    } else {
                        report(owner, 'mutableValue', { what: '`Object.entries` pair' });
                    }
                    return;
                default:
                    report(owner, 'uninspectableItems', { what });
            }
        }

        /** The values `Object.values`/`Object.entries` take from `object`. */
        function checkObjectValues({ owner, what }: CheckItemsParams, object: OxlintNode | undefined): void {
            if (object == null || isNode(object, 'Identifier') || isNode(object, 'MemberExpression')) {
                return;
            }

            const node: OxlintAnyNode = object;
            if (node.type === 'ObjectExpression') {
                checkEach(node.properties, 'mutable');
                return;
            }

            report(owner, 'uninspectableItems', { what });
        }

        function checkItem({ owner, what, role }: CheckItemsParams, item: OxlintNode): void {
            if (role === 'element') {
                checkValue(item, 'mutable');
                return;
            }

            // An entry literal is only read: both halves are kept, the pair itself is not.
            const entry: OxlintAnyNode = unwrapAssertions(item);
            if (entry.type === 'ArrayExpression') {
                checkEach(entry.elements, 'mutable');
            } else if (entry.type !== 'Identifier' && entry.type !== 'MemberExpression') {
                report(owner, 'uninspectableItems', { what });
            }
        }

        function isAllowedCallee(callee: OxlintNode): boolean {
            if (isNode(callee, 'Identifier')) {
                return isAllowedIdentifierCallee(callee);
            }

            if (isNode(callee, 'MemberExpression')) {
                const staticName = globalStaticCallName(callee);
                if (staticName != null) {
                    return PRIMITIVE_STATIC_CALLS.has(staticName);
                }

                // `ns.fn()` on a namespace import resolves to `fn` in the imported module.
                if (isNode(callee.object, 'Identifier') && !callee.computed && isNode(callee.property, 'Identifier')) {
                    return isAllowedNamespaceMember(callee.object, callee.property.name);
                }

                // A chain — `z.string().min(1)` — is allowed when it starts in an external package.
                const root = chainRoot(callee);
                return root != null && isExternal(importOf(root));
            }

            // A curried call — `Context.Service<T>()('Name')` — is allowed when its chain starts in an
            // external package, like a member chain.
            if (isNode(callee, 'CallExpression')) {
                const root = chainRoot(callee);
                return root != null && isExternal(importOf(root));
            }

            if (callee.type === 'ParenthesizedExpression' || callee.type === 'TSNonNullExpression') {
                const inner: OxlintAnyNode = callee;
                return inner.expression != null && isAllowedCallee(inner.expression);
            }

            return false;
        }

        function isAllowedIdentifierCallee(callee: OxlintIdentifier): boolean {
            const definitions = findVariable(context.sourceCode.getScope(callee), callee.name)?.defs ?? [];
            if (definitions.length === 0) {
                return PRIMITIVE_GLOBAL_CALLS.has(callee.name);
            }

            // An overloaded function has a definition per signature; the annotation may be on any.
            return definitions.some(definition => isAnnotatedDefinition(callee, definition));
        }

        function isAnnotatedDefinition(callee: OxlintIdentifier, definition: OxlintDefinition): boolean {
            switch (definition.type) {
                case 'FunctionName':
                    return hasAnnotationInFile(context, definition.node);
                case 'Variable':
                    // The JSDoc sits before the whole `const … = …` declaration, not its declarator.
                    return hasAnnotationInFile(context, definition.parent ?? definition.node);
                case 'ImportBinding': {
                    const binding = importOf(callee);
                    if (binding == null) {
                        return false;
                    }
                    // A default or namespace binding names no export to look the annotation up on.
                    return (
                        isExternal(binding) ||
                        (binding.name != null && isAnnotatedImport(binding.specifier, binding.name))
                    );
                }
                default:
                    return false;
            }
        }

        /** `ns.fn()` on an import: an external package's namespace, or `fn` of an imported module. */
        function isAllowedNamespaceMember(object: OxlintIdentifier, member: string): boolean {
            const binding = importOf(object);
            if (binding == null) {
                return false;
            }

            if (isExternal(binding)) {
                return true;
            }

            return binding.namespace && isAnnotatedImport(binding.specifier, member);
        }

        function isAnnotatedImport(specifier: string, exportName: string): boolean {
            const target = resolveSourceSpecifier(context.filename, specifier);
            return target != null && isAnnotatedExport(target, exportName, resolveSourceSpecifier);
        }

        /** Where `identifier` is imported from, when it is an import binding at all. */
        function importOf(identifier: OxlintIdentifier): ImportedBinding | undefined {
            const definition = findVariable(context.sourceCode.getScope(identifier), identifier.name)?.defs[0];
            const declaration = definition?.parent;
            if (
                definition?.type !== 'ImportBinding' ||
                declaration == null ||
                !isNode(declaration, 'ImportDeclaration')
            ) {
                return undefined;
            }

            const { node } = definition;
            const specifier = declaration.source.value;
            if (isNode(node, 'ImportSpecifier')) {
                return {
                    specifier,
                    name: isNode(node.imported, 'Identifier') ? node.imported.name : undefined,
                    namespace: false,
                };
            }

            return {
                specifier,
                name: node.type === 'ImportDefaultSpecifier' ? 'default' : undefined,
                namespace: node.type === 'ImportNamespaceSpecifier',
            };
        }

        function isExternal(binding: ImportedBinding | undefined): boolean {
            return binding != null && externalPackages.some(entry => matchesExternalEntry(entry, binding));
        }

        /** An identifier no code declares — a global such as `Map` or `Symbol`. */
        function isGlobalIdentifier(node: OxlintNode): node is OxlintIdentifier {
            if (!isNode(node, 'Identifier')) {
                return false;
            }

            // The scope manager lists the environment's globals as variables with no definition.
            const variable = findVariable(context.sourceCode.getScope(node), node.name);
            return variable == null || variable.defs.length === 0;
        }

        function isGlobalMember(node: OxlintNode, object: string, property: string): boolean {
            return globalStaticCallName(node) === `${object}.${property}`;
        }

        /** `Object.keys` for a callee that reads a fixed member off a global, else `undefined`. */
        function globalStaticCallName(node: OxlintNode): string | undefined {
            if (!isNode(node, 'MemberExpression') || node.computed || !isNode(node.property, 'Identifier')) {
                return undefined;
            }

            return isGlobalIdentifier(node.object) ? `${node.object.name}.${node.property.name}` : undefined;
        }
    },
};

interface CheckItemsParams {
    /** The value the items are kept in, reported when one cannot be seen. */
    owner: OxlintNode;
    /** How the report names `owner`. */
    what: string;
    iterable?: OxlintNode | undefined;
    /** A function mapping each item of `iterable` to what is kept instead. */
    mapper?: OxlintNode | undefined;
    role: ItemRole;
}

/** An import binding, by the module it comes from and the export it names. */
interface ImportedBinding {
    specifier: string;
    /** The export imported — `default` for a default import; `undefined` for a namespace import. */
    name: string | undefined;
    namespace: boolean;
}

/**
 * Whether an `externalPackages` entry covers an import. A bare entry covers the package and every
 * subpath below it; `pkg#name` covers only that one export of exactly that specifier, for a package
 * whose other exports must stay out (`vue#defineComponent`, but never `vue`'s `ref`).
 */
function matchesExternalEntry(entry: string, binding: ImportedBinding): boolean {
    const hash = entry.indexOf('#');
    if (hash >= 0) {
        return binding.specifier === entry.slice(0, hash) && binding.name === entry.slice(hash + 1);
    }

    return binding.specifier === entry || binding.specifier.startsWith(`${entry}/`);
}

function readExternalPackages(options: unknown): string[] {
    if (typeof options !== 'object' || options === null || !('externalPackages' in options)) {
        return [];
    }

    const { externalPackages } = options;
    return Array.isArray(externalPackages)
        ? externalPackages.filter((name): name is string => typeof name === 'string')
        : [];
}

function mutabilityOfAnnotation(annotation: OxlintTsTypeAnnotation | OxlintNode | null | undefined): Mutability {
    if (annotation == null) {
        return 'mutable';
    }

    const node: OxlintAnyNode = annotation;
    return node.type === 'TSTypeAnnotation' && node.typeAnnotation != null
        ? mutabilityOfType(node.typeAnnotation)
        : 'mutable';
}

/**
 * `as const`, `Immutable<…>`, `readonly T[]` and the `Readonly*` types; nothing is inferred from the
 * type arguments, so a readonly type spelled inside `Readonly<…>` still leaves its literal `mutable`.
 */
function mutabilityOfType(type: OxlintNode): Mutability {
    if (isNode(type, 'TSTypeOperator')) {
        return type.operator === 'readonly' ? 'Array' : 'mutable';
    }

    if (isNode(type, 'TSTypeReference') && isNode(type.typeName, 'Identifier')) {
        const name = type.typeName.name;
        return name === 'const' ? 'const' : (READONLY_TYPES.get(name) ?? 'mutable');
    }

    return 'mutable';
}

/** The mutability of a literal nested in one at `mutability`: only `deep` and `const` reach it. */
function nestedMutability(mutability: Mutability): Mutability {
    return mutability === 'deep' || mutability === 'const' ? mutability : 'mutable';
}

/**
 * The mutability of an expression asserted `as` a type that gives `asserted`. A declared
 * `Immutable<…>` around it still governs; under `as const` the assertion decides that part's type, so
 * a mutable one wins; under a shallow declared type an assertion only re-states the value's own type.
 */
function assertedMutability(mutability: Mutability, asserted: Mutability): Mutability {
    if (mutability === 'deep') {
        return 'deep';
    }

    if (mutability === 'const') {
        return asserted;
    }

    return asserted === 'mutable' ? mutability : asserted;
}

/** What a function passed as a mapper returns, when it is an arrow with an expression body. */
function returnedExpression(mapper: OxlintNode): OxlintNode | undefined {
    const node: OxlintAnyNode = mapper;
    if (node.type !== 'ArrowFunctionExpression' || node.body == null || Array.isArray(node.body)) {
        return undefined;
    }

    return node.body.type === 'BlockStatement' ? undefined : node.body;
}

/** The expression under any type assertions and other wrappers that only speak to the type checker. */
function unwrapAssertions(node: OxlintNode): OxlintNode {
    const wrapper: OxlintAnyNode = node;
    const isWrapper =
        TYPE_WRAPPERS.has(wrapper.type) || wrapper.type === 'TSAsExpression' || wrapper.type === 'TSTypeAssertion';
    return isWrapper && wrapper.expression != null ? unwrapAssertions(wrapper.expression) : node;
}

function itemRoleOf(collection: string): ItemRole {
    return collection === 'Map' ? 'entry' : 'element';
}

function isNamedMember(node: OxlintMemberExpression, name: string): boolean {
    return !node.computed && isNode(node.property, 'Identifier') && node.property.name === name;
}

/** The identifier a member/call chain starts from: `z` in `z.string().min(1)`. */
function chainRoot(node: OxlintNode): OxlintIdentifier | undefined {
    let current: OxlintNode = node;
    for (;;) {
        if (isNode(current, 'Identifier')) {
            return current;
        }
        if (isNode(current, 'MemberExpression')) {
            current = current.object;
            continue;
        }
        if (isNode(current, 'CallExpression')) {
            current = current.callee;
            continue;
        }
        return undefined;
    }
}

function calleeName(callee: OxlintNode): string {
    if (isNode(callee, 'Identifier')) {
        return callee.name;
    }

    if (isNode(callee, 'MemberExpression') && !callee.computed && isNode(callee.property, 'Identifier')) {
        return `${calleeName(callee.object)}.${callee.property.name}`;
    }

    if (isNode(callee, 'CallExpression')) {
        return `${calleeName(callee.callee)}(…)`;
    }

    return 'this call';
}
