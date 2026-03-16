import { defineComponent } from 'vue';
import type { VNodeChild } from 'vue';

const FORMAT_REGEX = /\{\s*(\w*)\s*\}/gm;

/** Component that interpolates named slots into a format string using `{slotName}` placeholders. */
export const Format = defineComponent({
    props: {
        format: { type: String, required: true },
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

            while ((match = FORMAT_REGEX.exec(format))) {
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
