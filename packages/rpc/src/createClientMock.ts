import type { PromiseMaybe } from '@nzyme/types/Promises.js';
import type { UnionToIntersection } from '@nzyme/types/Union.js';
import { toJson } from '@nzyme/utils/toJson.js';
import type { Json } from '@nzyme/utils/toJson.js';

import type { RpcClient } from './createClient.js';
import type { Endpoint } from './defineEndpoint.js';

/**
 *
 */
export type CreateClientMockOptions<E extends Endpoint> = UnionToIntersection<
    E extends Endpoint<infer TName, infer TInput, infer TOutput>
        ? { [K in TName]?: (input: Json<TInput>) => PromiseMaybe<TOutput> }
        : never
>;

/**
 *
 */
export function createClientMock<E extends Endpoint, O = void>(options: CreateClientMockOptions<E>): RpcClient<E, O> {
    const handlers = options as Record<string, ((input: unknown) => PromiseMaybe<unknown>) | undefined>;

    return new Proxy(handlers, {
        get(target, endpoint) {
            if (typeof endpoint === 'symbol') {
                return undefined;
            }

            const endpointMock = target[endpoint];
            if (!endpointMock) {
                // Return undefined for implicit property probes (e.g. `then`, `toJSON`)
                // that libraries perform when normalizing values via Promise resolution
                // or serialization. Only actual endpoint invocations should fail.
                if (!(endpoint in target)) {
                    return undefined;
                }

                throw new Error(`Endpoint ${endpoint} not mocked!`);
            }

            return async (input: unknown) => {
                const result = await endpointMock(input);
                return toJson(result);
            };
        },
    }) as RpcClient<E, O>;
}
