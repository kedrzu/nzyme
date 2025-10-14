/**
 * Returns the input value unchanged.
 *
 * @template TIn - The type of the input value
 * @template TOut - The type of the output value
 * @param value - The value to return
 * @returns The input value unchanged
 * @__NO_SIDE_EFFECTS__
 */
export function identity<TIn, TOut = TIn>(value: TIn): TOut {
    return value as unknown as TOut;
}
