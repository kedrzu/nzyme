import { defineComponent } from 'vue';
import type { SetupContext, Slot, SlotsType, VNode } from 'vue';

import type { Translation, TranslationAny, TranslationParams } from '@nzyme/i18n-core/Translation.js';
import type { EmptyObject } from '@nzyme/types/EmptyObject.js';

interface TranslateProps<T extends TranslationAny> {
    t: Translation<T>;
}

type TranslateSlots<T extends TranslationAny> = SlotsType<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [K in keyof TranslationParams<T>]: any;
}>;

type TranslateContext<T extends TranslationAny> = SetupContext<EmptyObject, TranslateSlots<T>>;

// /**
//  *
//  */
// export function Translate<T extends TranslationAny>(
//     props: TranslateProps<T>,
//     ctx: TranslateContext<T>,
// ): VNode | VNode[] {
//     const lang = 'pl';
//     const params: Record<string, unknown> = {};
//     for (const [key, slot] of Object.entries(ctx.slots)) {
//         if (key !== 't') {
//             params[key] = (slot as Slot)?.();
//         }
//     }

//     return props.t(lang, params) as VNode | VNode[];
// }
const setup = <T extends TranslationAny>(props: TranslateProps<T>, ctx: TranslateContext<T>) => {
    return () => {
        const lang = 'pl';
        const params: Record<string, unknown> = {};
        for (const [key, slot] of Object.entries(ctx.slots)) {
            if (key !== 't') {
                params[key] = (slot as Slot)?.();
            }
        }

        return props.t(lang, params as TranslationParams<T>) as VNode | VNode[];
    };
};

/**
 *
 */
export const Translate = defineComponent(
    setup,
    // manual runtime props declaration is currently still needed.
    {
        props: ['t'],
    },
);
