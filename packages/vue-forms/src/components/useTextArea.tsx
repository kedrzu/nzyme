import { h, onMounted, ref, watch } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';
import css from './useTextarea.module.scss';

const TEXT_AREA_FIELD = defineFormField(String);
const TEXT_AREA_PROPS = defineProps({
    ...TEXT_AREA_FIELD.props,
    label: String,
    name: String,
    placeholder: String,
    tabindex: Number,
    /** Trims the input text. Enabled by default. */
    trim: {
        type: Boolean,
        default: true,
    },
    disabled: Boolean,
    readonly: Boolean,
});

/*#__NO_SIDE_EFFECTS__*/
export const useTextArea = assignProps(setupTextArea, {
    props: TEXT_AREA_PROPS,
    emits: TEXT_AREA_FIELD.emits,
});

/*#__NO_SIDE_EFFECTS__*/
function setupTextArea() {
    const props = useProps(TEXT_AREA_PROPS);
    const field = TEXT_AREA_FIELD.create({ props });
    const textarea = ref<HTMLTextAreaElement>();

    onMounted(updateHeight);
    watch(() => field.value, updateValue);

    return {
        field,
        component,
    };

    function updateHeight() {
        if (textarea.value) {
            textarea.value.style.height = textarea.value.scrollHeight + 'px';
        }
    }

    function updateValue() {
        if (textarea.value) {
            textarea.value.value = field.value || '';
        }
    }

    function onInput(event: Event) {
        const target = event.target as HTMLTextAreaElement;
        const value = props.trim ? target.value.trim() : target.value;

        field.value = value;

        target.style.height = '0';
        target.style.height = target.scrollHeight + 'px';
    }

    function component() {
        return (
            <textarea
                aria-label={props.label}
                class={css.textarea}
                disabled={props.disabled}
                name={props.name}
                onBlur={field.inputAttrs.onBlur}
                onFocus={field.inputAttrs.onFocus}
                onInput={onInput}
                placeholder={props.placeholder}
                readonly={props.readonly}
                ref={textarea}
                tabindex={props.tabindex}
                title={props.label}
            >
                {field.value}
            </textarea>
        );
    }
}
