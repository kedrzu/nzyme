import { defineService } from '../Service.js';

/**
 *
 */
export const ContextProvider = defineService({
    name: 'ContextProvider',
    setup() {
        let ctx = new Map<symbol, unknown>();
        let ctxId = '';

        return {
            get,
            getOrCreate,
            get id() {
                return ctxId;
            },
            newContext,
            remove,
            set,
        };

        function get<T>(key: symbol) {
            return ctx.get(key) as T | undefined;
        }

        function getOrCreate<T>(key: symbol, factory: () => T): T {
            let value = ctx.get(key);
            if (value === undefined) {
                value = factory();
                ctx.set(key, value);
            }

            return value as T;
        }

        function set<T>(key: symbol, value: T) {
            ctx.set(key, value);
            return value;
        }

        function remove(key: symbol) {
            ctx.delete(key);
        }

        function newContext(id: string) {
            ctx = new Map();
            ctxId = id;
        }
    },
});
