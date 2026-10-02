import type { ValidationContext } from '../Validator.js';
import type { Rule } from './Rule.js';

/**
 * Defines a rule with its node and context types pinned, so the rule body is checked against them
 * without annotating every parameter.
 * @__NO_SIDE_EFFECTS__
 */
export function defineRule<T, C extends ValidationContext = ValidationContext>(rule: Rule<T, C>): Rule<T, C> {
    return rule;
}
