import { computed } from 'vue';

import { CURRENCIES, moneyDenormalize, moneyNormalize } from '@nzyme/money';
import type { Currency } from '@nzyme/money';
import { assignProps } from '@nzyme/utils';

import { defineMaskedInput, type MaskedInputMaskConfig } from './useMaskedInput.js';

export type MoneyInputOptions = {
    currency: Currency;
};

const MONEY_INPUT = defineMaskedInput<number>();

/**
 * Creates a money input component with currency formatting and validation.
 * This is a specialized version of useMaskedInput configured for money values.
 */
export const useMoneyInput = assignProps(setupMoneyInput, {
    props: MONEY_INPUT.props,
    emits: MONEY_INPUT.emits,
});

/**
 * Sets up a money input with currency-specific formatting.
 *
 * @param options - Configuration options for the money input
 * @__NO_SIDE_EFFECTS__
 */
function setupMoneyInput(options: MoneyInputOptions) {
    const currency = computed(() => CURRENCIES[options.currency]);

    const maskConfig = computed<MaskedInputMaskConfig>(() => ({
        mask: `num\u00A0${currency.value.symbol}`,
        blocks: {
            num: {
                mask: Number,
                thousandsSeparator: '\u00A0',
                radix: currency.value.fractionSymbol,
                scale: currency.value.fractionDigits,
            },
        },
        lazy: false,
        inputmode: 'numeric',
    }));

    const maskedInput = MONEY_INPUT({
        maskConfig: maskConfig.value,
        toModelValue: (typedValue: unknown) => {
            const value = typedValue as number | null;
            return value != null ? moneyNormalize(value, options.currency) : null;
        },
        toTypedValue: (modelValue: number | null | undefined) => {
            if (modelValue == null) {
                return 0;
            }
            return moneyDenormalize(modelValue, options.currency);
        },
    });

    return {
        field: maskedInput.field,
        MoneyInput: maskedInput.MaskedInput,
    };
}
