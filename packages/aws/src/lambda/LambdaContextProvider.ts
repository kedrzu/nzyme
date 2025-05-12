import type { Context } from 'aws-lambda';

import { defineService } from '@nzyme/ioc';

/**
 *
 */
export const LambdaContextProvider = defineService({
    name: 'LambdaContextProvider',
    setup: () => {
        let ctx: Context | undefined;

        return {
            set,
            get,
        };

        function set(value: Context) {
            ctx = value;
        }

        function get(): Context | undefined {
            return ctx;
        }
    },
});
