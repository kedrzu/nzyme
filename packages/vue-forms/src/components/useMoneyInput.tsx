import { computed } from 'vue';

import { CURRENCIES } from '@nzyme/money/Currency.js';
import { moneyDenormalize } from '@nzyme/money/moneyDenormalize.js';
import { moneyNormalize } from '@nzyme/money/moneyNormalize.js';
import type { Currency } from '@nzyme/money/Currency.js';
import { assignProps } from '@nzyme/utils/assignProps.js';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { useProps } from '@nzyme/vue-utils/useProps.js';

import { defineMaskedInput } from './useMaskedInput.js';
import type { MaskedInputMaskConfig } from './useMaskedInput.js';

const MONEY_INPUT = defineMaskedInput<number>();

const MONEY_INPUT_PROPS = defineProps({
    ...MONEY_INPUT.props,
    currency: defineProp<Currency>({ required: true }),
});

/**
 * Creates a money input component with currency formatting and validation.
 * This is a specialized version of useMaskedInput configured for money values.
 */
export const useMoneyInput = assignProps(setupMoneyInput, {
    props: MONEY_INPUT_PROPS,
    emits: MONEY_INPUT.emits,
});

/**
 * Sets up a money input with currency-specific formatting.
 *
 * @__NO_SIDE_EFFECTS__
 */
function setupMoneyInput() {
    const props = useProps(MONEY_INPUT_PROPS);

    const maskConfig = computed<MaskedInputMaskConfig>(() => {
        const currency = CURRENCIES[props.currency];
        return {
            mask: `num\u00A0${currency.symbol}`,
            blocks: {
                num: {
                    mask: Number,
                    thousandsSeparator: '\u00A0',
                    radix: currency.fractionSymbol,
                    scale: currency.fractionDigits,
                },
            },
            lazy: false,
            inputmode: 'numeric',
        };
    });

    const maskedInput = MONEY_INPUT({
        maskConfig,
        toModelValue: (typedValue: unknown) => {
            const value = typedValue as number | null;
            return value != null ? moneyNormalize(value, props.currency) : null;
        },
        toTypedValue: (modelValue: number | null | undefined) => {
            if (modelValue == null) {
                return 0;
            }
            return moneyDenormalize(modelValue, props.currency);
        },
    });

    return {
        field: maskedInput.field,
        MoneyInput: maskedInput.MaskedInput,
    };
}
