// These types are inspired by ExpressJS

import type { Primitive } from './Common.js';
import type { SomeObject } from './Object.js';

/** Extracts route parameter names from an Express-style route string into a typed record. */
export type RouteParameters<Route extends string> = string extends Route
    ? ParamsDictionary
    : Route extends `${string}(${string}`
      ? ParamsDictionary //TODO: handling for regex parameters
      : Route extends `${string}:${infer Rest}`
        ? (GetRouteParameter<Rest> extends never
              ? ParamsDictionary
              : GetRouteParameter<Rest> extends `${infer ParamName}?`
                ? { [P in ParamName]?: Primitive }
                : { [P in GetRouteParameter<Rest>]: Primitive }) &
              (Rest extends `${GetRouteParameter<Rest>}${infer Next}` ? RouteParameters<Next> : unknown)
        : SomeObject;

interface ParamsDictionary {
    [key: string]: Primitive;
}

type RemoveTail<S extends string, Tail extends string> = S extends `${infer P}${Tail}` ? P : S;

type GetRouteParameter<S extends string> = RemoveTail<
    RemoveTail<RemoveTail<S, `/${string}`>, `-${string}`>,
    `.${string}`
>;
