import { describe, expect, it } from 'bun:test';
import * as ts from 'typescript';

import { extractEntity } from './extractEntity.js';
import type { IndexSymbol } from './IndexSymbol.js';

function extract(source: string): IndexSymbol[] {
    const sourceFile = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true);
    return extractEntity({
        sourceFile,
        packageName: '@acme/database',
        relPath: 'packages/database/src/schema/payment.ts',
        importPath: '@acme/database/schema/payment.js',
        tableFunctions: new Set(['pgTable', 'mysqlTable']),
    });
}

describe('extractEntity', () => {
    it('extracts a pgTable entity with the table name as internalName', () => {
        const symbols = extract(`
            /** Payment records. */
            export const payment = pgTable('payment', {
                id: bigintStrict('id').primaryKey(),
                status: paymentStatus('status').notNull(),
            });
        `);

        expect(symbols).toEqual([
            {
                kind: 'entity',
                packageName: '@acme/database',
                exportName: 'payment',
                importPath: '@acme/database/schema/payment.js',
                internalName: 'payment',
                description: 'Payment records.',
                signature: null,
                relPath: 'packages/database/src/schema/payment.ts',
            },
        ]);
    });

    it('extracts a pgTable entity with a trailing table-config argument', () => {
        const symbols = extract(`
            export const payment = pgTable(
                'payment',
                { id: bigintStrict('id').primaryKey() },
                table => [index('payment_id_idx').on(table.id)],
            );
        `);

        expect(symbols).toMatchObject([{ kind: 'entity', exportName: 'payment', internalName: 'payment' }]);
    });

    it('does not match a sibling enumType call in the same source', () => {
        const symbols = extract(`
            export const paymentStatus = enumType('payment_status', PaymentStatus.options);
            export const payment = pgTable('payment', { id: bigintStrict('id') });
        `);

        expect(symbols).toMatchObject([{ kind: 'entity', exportName: 'payment', internalName: 'payment' }]);
        expect(symbols).toHaveLength(1);
    });

    it('matches every configured table function', () => {
        const symbols = extract(`export const order = mysqlTable('orders', {});`);

        expect(symbols).toMatchObject([{ kind: 'entity', exportName: 'order', internalName: 'orders' }]);
    });

    it('does not match a table function that is not configured', () => {
        const symbols = extract(`export const order = sqliteTable('orders', {});`);

        expect(symbols).toEqual([]);
    });

    it('does not match a non-exported pgTable const', () => {
        const symbols = extract(`const internal = pgTable('internal', {});`);

        expect(symbols).toEqual([]);
    });

    it('does not match a property-access callee like schema.pgTable(...)', () => {
        const symbols = extract(`export const x = schema.pgTable('x', {});`);

        expect(symbols).toEqual([]);
    });

    it('emits an entity with null internalName when the first argument is not a string literal', () => {
        const symbols = extract(`export const dyn = pgTable(TABLE_NAME, { id: bigintStrict('id') });`);

        expect(symbols).toMatchObject([{ kind: 'entity', exportName: 'dyn', internalName: null }]);
    });

    it('does not throw on truncated/malformed source', () => {
        expect(() => extract(`export const x = pgTable(`)).not.toThrow();
        expect(() => extract(`export const x = pgTable('t',`)).not.toThrow();
    });
});
