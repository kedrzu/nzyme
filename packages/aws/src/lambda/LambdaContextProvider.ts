import { defineService } from '@nzyme/ioc';

import type { types } from './types.js';

/**
 *
 */
export const LambdaContextProvider = defineService({
    name: 'LambdaContextProvider',
    setup: () => {
        let ctx: types.Context | undefined;

        return {
            set,
            get,
        };

        function set(value: types.Context) {
            ctx = value;
        }

        function get(): types.Context | undefined {
            return ctx;
        }
    },
});
