import { h, onMounted, ref, watch } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

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

    onMounted(updateValue);
    watch(() => field.value, updateValue);

    return {
        field,
        component,
    };

    function updateValue() {
        if (!textarea.value) {
            return;
        }

        textarea.value.value = field.value || '';
        updateHeight();
    }

    function updateHeight() {
        if (!textarea.value) {
            return;
        }

        textarea.value.style.height = '0';
        textarea.value.style.height = textarea.value.scrollHeight + 'px';
    }

    function onInput(event: Event) {
        const target = event.target as HTMLTextAreaElement;
        const value = props.trim ? target.value.trim() : target.value;

        field.value = value;
        updateHeight();
    }

    function component() {
        return (
            <textarea
                aria-label={props.label}
                disabled={props.disabled}
                name={props.name}
                onBlur={field.inputAttrs.onBlur}
                onFocus={field.inputAttrs.onFocus}
                onInput={onInput}
                placeholder={props.placeholder}
                readonly={props.readonly}
                ref={textarea}
                rows={1}
                tabindex={props.tabindex}
                title={props.label}
            >
                {field.value}
            </textarea>
        );
    }
}
