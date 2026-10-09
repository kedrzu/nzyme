import { describe, expect, it } from 'bun:test';
import * as ts from 'typescript';

import { extractDefineSymbol } from './extractDefineSymbol.js';
import { getIndexSettings } from './IndexSettings.js';
import type { IndexSymbol } from './IndexSymbol.js';

/** The built-in kinds plus a configured `defineActor` kind whose internal name lives under `type:`. */
const settings = getIndexSettings({
    defineKinds: [{ kind: 'actor', section: 'Actors', callee: 'defineActor', nameKey: 'type', order: 40 }],
});
const kindsByCallee = new Map(settings.defineKinds.map(kind => [kind.callee, kind]));

function extract(source: string): IndexSymbol[] {
    const sourceFile = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true);
    return extractDefineSymbol({
        sourceFile,
        packageName: '@acme/test',
        relPath: 'packages/test/src/x.ts',
        importPath: '@acme/test/x.js',
        kindsByCallee,
    });
}

describe('extractDefineSymbol', () => {
    it('extracts a service with name and description', () => {
        const symbols = extract(`
            /** The payment client. */
            export const PaymentClient = defineService({ name: 'PaymentClient', deps: {} });
        `);

        expect(symbols).toEqual([
            {
                kind: 'service',
                packageName: '@acme/test',
                exportName: 'PaymentClient',
                importPath: '@acme/test/x.js',
                internalName: 'PaymentClient',
                description: 'The payment client.',
                signature: null,
                relPath: 'packages/test/src/x.ts',
            },
        ]);
    });

    it('extracts a command from its name key', () => {
        const symbols = extract(`export const ChatStartCommand = defineCommand({ name: 'ChatStart', deps: {} });`);

        expect(symbols).toMatchObject([{ kind: 'command', exportName: 'ChatStartCommand', internalName: 'ChatStart' }]);
    });

    it('extracts a factory from its name key', () => {
        const symbols = extract(`export const WidgetFactory = defineFactory({ name: 'Widget', setup() {} });`);

        expect(symbols).toMatchObject([{ kind: 'factory', exportName: 'WidgetFactory', internalName: 'Widget' }]);
    });

    it('extracts an endpoint from its name key', () => {
        const symbols = extract(`
            /** Support chat list. */
            export const ChatListEndpoint = defineEndpoint({ name: 'SupportChatList', input, output });
        `);

        expect(symbols).toMatchObject([
            {
                kind: 'endpoint',
                exportName: 'ChatListEndpoint',
                internalName: 'SupportChatList',
                description: 'Support chat list.',
            },
        ]);
    });

    it('extracts a configured kind from its configured name key (not name)', () => {
        const symbols = extract(
            `export const ChatActor = defineActor({ type: 'chat', parseId: BigInt, users: [], requests: {} });`,
        );

        expect(symbols).toMatchObject([{ kind: 'actor', exportName: 'ChatActor', internalName: 'chat' }]);
    });

    it('ignores a callee that is not configured', () => {
        const symbols = extractDefineSymbol({
            sourceFile: ts.createSourceFile(
                'x.ts',
                `export const ChatActor = defineActor({ type: 'chat' });`,
                ts.ScriptTarget.Latest,
                true,
            ),
            packageName: '@acme/test',
            relPath: 'packages/test/src/x.ts',
            importPath: '@acme/test/x.js',
            kindsByCallee: new Map(getIndexSettings({}).defineKinds.map(kind => [kind.callee, kind])),
        });

        expect(symbols).toEqual([]);
    });

    it('emits only the endpoint when a sibling Options z.object export is present', () => {
        const symbols = extract(`
            export const ChatListEndpointOptions = z.object({ chatId: Id });
            export interface ChatListEndpointResult extends BaseResult {}
            /** Support chat list. */
            export const ChatListEndpoint = defineEndpoint({
                name: 'SupportChatList',
                input: ChatListEndpointOptions,
                output,
            });
        `);

        expect(symbols).toMatchObject([
            { kind: 'endpoint', exportName: 'ChatListEndpoint', internalName: 'SupportChatList' },
        ]);
        expect(symbols).toHaveLength(1);
    });

    it('emits an endpoint without options and still reads its name', () => {
        const symbols = extract(`export const PingEndpoint = defineEndpoint({ name: 'Ping', output });`);

        expect(symbols).toMatchObject([{ kind: 'endpoint', exportName: 'PingEndpoint', internalName: 'Ping' }]);
    });

    it('returns null description when a defineService has no JSDoc', () => {
        const symbols = extract(`export const BareService = defineService({ name: 'Bare', deps: {} });`);

        expect(symbols[0]?.description).toBeNull();
    });

    it('extracts multiple symbols from one file', () => {
        const symbols = extract(`
            export const FirstService = defineService({ name: 'First' });
            export const SecondCommand = defineCommand({ name: 'Second' });
        `);

        expect(symbols).toMatchObject([
            { kind: 'service', exportName: 'FirstService', internalName: 'First' },
            { kind: 'command', exportName: 'SecondCommand', internalName: 'Second' },
        ]);
    });

    it('returns [] for a source with no known callee', () => {
        const symbols = extract(`
            export const ChatListEndpointOptions = z.object({ chatId: Id });
            export const helper = defineSomethingElse({ name: 'nope' });
            export function doThing() {}
        `);

        expect(symbols).toEqual([]);
    });

    it('does not match defineEndpoint.output<T>() property-access callee', () => {
        const symbols = extract(`export const output = defineEndpoint.output<Result>();`);

        expect(symbols).toEqual([]);
    });

    it('does not match a non-exported const', () => {
        const symbols = extract(`const InternalService = defineService({ name: 'Internal' });`);

        expect(symbols).toEqual([]);
    });

    it('returns null internalName when the name value is not a string literal', () => {
        const symbols = extract(`export const DynService = defineService({ name: SOME_CONST, deps: {} });`);

        expect(symbols).toMatchObject([{ kind: 'service', exportName: 'DynService', internalName: null }]);
    });

    it('returns null internalName when the name key is absent', () => {
        const symbols = extract(`export const NoNameService = defineService({ deps: {} });`);

        expect(symbols).toMatchObject([{ kind: 'service', exportName: 'NoNameService', internalName: null }]);
    });

    it('does not throw and returns [] on a non-object argument', () => {
        const symbols = extract(`export const X = defineService(someVar);`);

        expect(symbols).toMatchObject([{ kind: 'service', exportName: 'X', internalName: null }]);
    });

    it('does not throw on truncated/malformed source', () => {
        expect(() => extract(`export const X = defineService(`)).not.toThrow();
        expect(() => extract(`export const Y = defineService({ name: `)).not.toThrow();
    });
});
