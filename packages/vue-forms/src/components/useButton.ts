import { assignProps } from '@nzyme/utils/assignProps.js';
import { waitFor } from '@nzyme/utils/waitFor.js';
import { injectContext } from '@nzyme/vue-utils/context.js';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { useEmit } from '@nzyme/vue-utils/useEmit.js';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';
import { useProps } from '@nzyme/vue-utils/useProps.js';
import { computed, h, ref } from 'vue';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, PropType, SetupContext } from 'vue';
import { RouterLink } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';

import { FormContext } from '../FormContext.js';

const BUTTON_PROPS = defineProps({
    type: {
        type: String as PropType<'button' | 'submit'>,
        default: 'button',
    },
    busy: {
        type: Boolean,
        default: false,
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    link: defineProp<string | RouteLocationRaw | null>(),
    noWait: Boolean,
});

const BUTTON_EMITS = {
    click: (event: Event) => !!event,
    'update:busy': (_busy: boolean) => true,
};

/**
 * Button props
 */
export interface ButtonProps {
    /**
     * Button type
     */
    type?: 'button' | 'submit';
    /**
     * Whether the button is busy
     */
    busy?: boolean;
    /**
     * Whether the button is disabled
     */
    disabled?: boolean;
    /**
     * Link to navigate to
     */
    link?: string | RouteLocationRaw | null;
    /**
     * Whether the button should wait for the click event to complete
     */
    noWait?: boolean;
}

/**
 * Button emits
 */
export interface ButtonEmits {
    /**
     * Click event
     */
    click: Event;
    /**
     * Update busy event
     */
    'update:busy': boolean;
}

const urlRegex = /^\w+:\/\//;

/**
 * @__NO_SIDE_EFFECTS__
 */
export const useButton = assignProps(setupButton, {
    props: BUTTON_PROPS,
    emits: BUTTON_EMITS,
});

function setupButton() {
    const props = useProps<ButtonProps>();
    const emit = useEmit<ButtonEmits>();
    const emitAsync = useEmitAsync<ButtonEmits>();
    const formCtx = injectContext(FormContext, { optional: true });
    const pending = ref(false);

    const busy = computed(() => {
        if (props.busy || pending.value) {
            return true;
        }

        if (formCtx?.pending && props.type === 'submit') {
            return true;
        }

        return false;
    });

    const disabled = computed(() => props.disabled);

    return {
        busy,
        disabled,
        click: (event: Event) => onClick(event),
        Button,
    };

    function Button(attrs: AnchorHTMLAttributes | ButtonHTMLAttributes, ctx: SetupContext) {
        const link = props.link;

        if (!link) {
            return h(
                'button',
                {
                    ...attrs,
                    disabled: disabled.value || undefined,
                    type: props.type,
                    onClick,
                },
                ctx.slots,
            );
        }

        if (typeof link === 'string') {
            if (urlRegex.test(link)) {
                // External link
                return h(
                    'a',
                    {
                        ...attrs,
                        href: link,
                        rel: 'noopener noreferrer',
                        onClick,
                        disabled: disabled.value || undefined,
                    },
                    ctx.slots,
                );
            } else if (link.startsWith('#')) {
                // Hash link
                return h(
                    'a',
                    {
                        ...attrs,
                        href: link,
                        onClick,
                        disabled: disabled.value || undefined,
                    },
                    ctx.slots,
                );
            }
        }

        // Internal link - use RouterLink
        return h(
            RouterLink,
            {
                to: link,
                custom: true,
            },
            {
                default: ({ navigate, href }: { navigate: (e?: Event) => Promise<Error | void>; href: string }) => {
                    return h(
                        'a',
                        {
                            href,
                            onClick: (event: Event) => onClick(event, navigate),
                            disabled: disabled.value || undefined,
                        },
                        ctx.slots,
                    );
                },
            },
        );
    }

    async function onClick(event: Event, navigate?: (e?: Event) => Promise<unknown>) {
        if (props.disabled || pending.value) {
            event.stopPropagation();
            event.preventDefault();
            return;
        }

        if (!navigate) {
            event.stopPropagation();
            event.preventDefault();
        }

        try {
            pending.value = !props.noWait;
            emit('update:busy', pending.value);

            const result = emitAsync('click', event);
            if (result instanceof Promise) {
                await result;
            }

            if (navigate) {
                await navigate(event);
            } else if (props.type === 'submit') {
                await formCtx?.submit();
            }

            if (navigate) {
                await waitFor(500);
            }
        } finally {
            pending.value = false;
            emit('update:busy', false);
        }
    }
}
