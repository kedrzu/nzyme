import { AsymmetricMatcher } from '@vitest/expect';
import { expect } from 'vitest';

class Nullish extends AsymmetricMatcher<void> {
    constructor(private readonly matcher: AsymmetricMatcher<void>) {
        super();
    }

    asymmetricMatch(other: unknown) {
        if (other == null) {
            return true;
        }

        return this.matcher.asymmetricMatch(other);
    }

    override toString(): string {
        return `${this.matcher.toString()} | null | undefined`;
    }

    override toAsymmetricMatcher(): string {
        return this.toString();
    }
}

/**
 *
 */
export function nullish<T>(matcher?: AsymmetricMatcher<void>) {
    if (!matcher) {
        matcher = expect.anything() as AsymmetricMatcher<void>;
    }

    return new Nullish(matcher) as unknown as T | null | undefined;
}
