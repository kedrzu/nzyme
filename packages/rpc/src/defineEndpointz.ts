import type { StandardSchemaV1 } from '@standard-schema/spec';

import { assignProps } from '@nzyme/utils/assignProps.js';

/**
 * Endpoint definition
 */
export interface EndpointDefinitionParams<TInput = void, TOutput = void> {
    /**
     * The name of the endpoint
     */
    name: string;

    /**
     * The input schema of the endpoint
     */
    input?: StandardSchemaV1<unknown, TInput>;

    /**
     * The output schema of the endpoint
     */
    output?: EndpointDefinitionOutput<TOutput>;
}

/**
 * Endpoint definition
 */
export type EndpointDefinition<TInput = void, TOutput = void> = EndpointDefinitionParams<TInput, TOutput> & {
    /**
     * The input of the endpoint
     * Not a real value - used only for type inference
     */
    $input: TInput;
    /**
     * The output of the endpoint
     * Not a real value - used only for type inference
     */
    $output: TOutput;
};

/**
 * Endpoint definition output
 */
export interface EndpointDefinitionOutput<TOutput = void> {
    /**
     * The output of the endpoint
     * Not a real value - used only for type inference
     */
    $output: TOutput;
}

/**
 * Endpoint define function
 */
export interface EndpointDefineFunction {
    /**
     * Define the endpoint
     */
    <TInput = void, TOutput = void>(
        endpoint: EndpointDefinitionParams<TInput, TOutput>,
    ): EndpointDefinition<TInput, TOutput>;

    /**
     * Define the output of the endpoint
     */
    output<TOutput = void>(): EndpointDefinitionOutput<TOutput>;
}

/**
 * Define the endpoint
 * @_NO_SIDE_EFFECTS_
 */
export const defineEndpoint: EndpointDefineFunction = assignProps(defineEndpointBase, {
    output: endpointOutput,
});

/**
 * Define the endpoint base function
 * @_NO_SIDE_EFFECTS_
 */
function defineEndpointBase<TInput = void, TOutput = void>(
    endpoint: EndpointDefinitionParams<TInput, TOutput>,
): EndpointDefinition<TInput, TOutput> {
    return {
        ...endpoint,
        $input: endpoint.input as TInput,
        $output: endpoint.output as TOutput,
    };
}

function endpointOutput<TOutput = void>(): EndpointDefinitionOutput<TOutput> {
    return {} as EndpointDefinitionOutput<TOutput>;
}
