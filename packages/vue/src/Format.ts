import { defineComponent, type VNodeChild } from 'vue';

import { prop } from './prop.js';

const regex = /\{\s*(\w*)\s*\}/gm;

export const Format = defineComponent({
    props: {
        format: prop(String).required(),
    },
    setup(props, ctx) {
        return () => {
            const format = props.format;
            if (!format) {
                return [];
            }

            const vnodes: VNodeChild[] = [];
            let index = 0;

            let match: RegExpExecArray | null;

            while ((match = regex.exec(format))) {
                if (match.index && match.index > index) {
                    // handle a piece of text
                    const text = format.substring(index, match.index);
                    vnodes.push(text);
                    index = match.index;
                }

                index += match[0].length;

                const slotName = match[1]!;
                const slot = ctx.slots[slotName];
                if (slot) {
                    vnodes.push(slot());
                }
            }

            // Add the rest of the text
            if (index < format.length) {
                const text = format.substring(index);
                vnodes.push(text);
            }

            return vnodes;
        };
    },
});
