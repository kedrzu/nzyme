import type { Money } from './Money.js';

/**
 * Multiply money by a number
 * @param money - The money value
 * @param multiplier - The multiplier
 * @returns The result of the multiplication
 * @__NO_SIDE_EFFECTS__
 */
export function moneyTimes(money: Money, multiplier: number): Money {
    return [Math.round(money[0] * multiplier), money[1]];
}

/**
 * Divide money by a number
 * @param money - The money value
 * @param divisor - The divisor
 * @returns The result of the division
 * @__NO_SIDE_EFFECTS__
 */
export function moneyDivide(money: Money, divisor: number): Money {
    return [Math.round(money[0] / divisor), money[1]];
}

/**
 * Add two money values
 * @param money1 - The first money value
 * @param money2 - The second money value
 * @returns The result of the addition
 * @__NO_SIDE_EFFECTS__
 */
export function moneyPlus(money1: Money, money2: Money): Money {
    assertCurrenciesMatch(money1, money2);
    return [money1[0] + money2[0], money1[1]];
}

/**
 * Sum an array of money values
 * @param money - The array of money values
 * @returns The result of the sum
 * @__NO_SIDE_EFFECTS__
 */
export function moneySum(money: (Money | null | undefined)[]): Money | null {
    if (money.length === 0) {
        return null;
    }

    let sum: Money | null = null;

    for (const moneyItem of money) {
        if (moneyItem == null) {
            continue;
        }

        if (sum == null) {
            sum = [...moneyItem];
            continue;
        }

        assertCurrenciesMatch(sum, moneyItem);
        sum[0] += moneyItem[0];
    }

    return sum;
}

/**
 * Subtract two money values
 * @throws {Error} If the currencies do not match
 * @param money1 - The first money value
 * @param money2 - The second money value
 * @returns The result of the subtraction
 * @__NO_SIDE_EFFECTS__
 */
export function moneyMinus(money1: Money, money2: Money): Money {
    assertCurrenciesMatch(money1, money2);
    return [money1[0] - money2[0], money1[1]];
}

/**
 * Negate a money value
 * @param money - The money value
 * @returns The result of the negation
 * @__NO_SIDE_EFFECTS__
 */
export function moneyNegative(money: Money): Money {
    return [money[0] * -1, money[1]];
}

/**
 * Calculate the percentage of a money value
 * @param money - The money value
 * @param percentage - The percentage
 * @returns The result of the percentage calculation
 * @__NO_SIDE_EFFECTS__
 */
export function moneyPercentage(money: Money, percentage: number): Money {
    return [Math.round((money[0] * percentage) / 100), money[1]];
}

/**
 * Get the maximum of two money values
 * @param money1 - The first money value
 * @param money2 - The second money value
 * @returns The maximum of the two money values
 * @__NO_SIDE_EFFECTS__
 */
export function moneyMax(money1: Money, money2: Money): Money {
    assertCurrenciesMatch(money1, money2);
    return [Math.max(money1[0], money2[0]), money1[1]];
}

/**
 * Get the minimum of two money values
 * @param money1 - The first money value
 * @param money2 - The second money value
 * @returns The minimum of the two money values
 * @__NO_SIDE_EFFECTS__
 */
export function moneyMin(money1: Money, money2: Money): Money {
    assertCurrenciesMatch(money1, money2);
    return [Math.min(money1[0], money2[0]), money1[1]];
}

/**
 * Get a money value with zero amount
 * @param money - The money value
 * @returns The money value with zero amount
 * @__NO_SIDE_EFFECTS__
 */
export function moneyZero(money: Money): Money {
    return [0, money[1]];
}

/**
 * Assert that two money values have the same currency
 * @param money1 - The first money value
 * @param money2 - The second money value
 * @throws {Error} If the currencies do not match
 * @__NO_SIDE_EFFECTS__
 */
export function assertCurrenciesMatch(money1: Money, money2: Money) {
    if (money1[1] !== money2[1]) {
        throw new Error(`Currencies do not match: ${money1[1]} !== ${money2[1]}`);
    }
}
