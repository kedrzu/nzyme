import { expect, test } from 'bun:test';
import { assertValue } from '@nzyme/utils/assert.js';
import { createRenderer, defineComponent, h, markRaw, nextTick, ref } from 'vue';

import type { FormFieldController } from './defineFormField.js';
import { getRadioEmits, getRadioProps, useRadio } from './useRadio.jsx';
import { getRadioGroupEmits, getRadioGroupProps, useRadioGroup } from './useRadioGroup.js';

let activeElement: TestNode | null = null;

test('useRadio puts only the selected radio, else the first enabled one, in the tab order', async () => {
    const { radios, value } = mountRadioGroup([{ value: 'a', disabled: true }, { value: 'b' }, { value: 'c' }]);
    expect(radios.map(radio => radio.props.tabindex)).toEqual([-1, 0, -1]);

    value.value = 'c';
    await nextTick();
    expect(radios.map(radio => radio.props.tabindex)).toEqual([-1, -1, 0]);
});

test('useRadio arrow keys move focus and selection, skipping disabled radios and wrapping around', async () => {
    const { radios, value } = mountRadioGroup([{ value: 'a' }, { value: 'b', disabled: true }, { value: 'c' }], 'a');

    await press(radios[0]!, 'ArrowDown');
    expect(value.value).toBe('c');
    expect(activeElement).toBe(radios[2]!);

    await press(radios[2]!, 'ArrowRight');
    expect(value.value).toBe('a');
    expect(activeElement).toBe(radios[0]!);

    await press(radios[0]!, 'ArrowUp');
    expect(value.value).toBe('c');
    expect(activeElement).toBe(radios[2]!);

    await press(radios[2]!, 'ArrowLeft');
    expect(value.value).toBe('a');
    expect(radios.map(radio => radio.props.tabindex)).toEqual([0, -1, -1]);
});

test('useRadio keeps a readonly group reachable: arrow keys move focus, nothing changes the selection', async () => {
    const { radios, value } = mountRadioGroup([{ value: 'a' }, { value: 'b' }, { value: 'c' }], 'b', {
        readonly: true,
    });
    await nextTick();
    expect(radios.map(radio => radio.props.tabindex)).toEqual([-1, 0, -1]);

    await press(radios[1]!, 'ArrowDown');
    expect(activeElement).toBe(radios[2]!);

    fire(radios[2]!, 'onClick', {});
    await press(radios[2]!, 'ArrowRight');
    expect(activeElement).toBe(radios[0]!);
    expect(value.value).toBe('b');
});

test('useRadioGroup returns the field its radios select', async () => {
    const { radios, field } = mountRadioGroup([{ value: 'a' }, { value: 'b' }], 'a', { errors: 'Pick one' });
    expect(field.errors).toEqual(['Pick one']);

    await press(radios[0]!, 'ArrowDown');
    expect(field.value).toBe('b');
});

test('useRadioGroup keeps its field focused while focus moves between its radios', () => {
    const events: string[] = [];
    const { radios, field } = mountRadioGroup([{ value: 'a' }, { value: 'b' }], 'a', {
        onFocus: () => events.push('focus'),
        onBlur: () => events.push('blur'),
    });

    fire(radios[0]!, 'onFocus', { relatedTarget: null });
    expect(field.focused).toBe(true);

    fire(radios[0]!, 'onBlur', { relatedTarget: radios[1]! });
    fire(radios[1]!, 'onFocus', { relatedTarget: radios[0]! });
    expect(field.focused).toBe(true);

    fire(radios[1]!, 'onBlur', { relatedTarget: null });
    expect(field.focused).toBe(false);
    expect(events).toEqual(['focus', 'blur']);
});

test('useRadio passes attributes through to the button', () => {
    const { radios } = mountRadioGroup([{ value: 'a' }]);

    expect(radios[0]!.props.id).toBe('radio-a');
    expect(radios[0]!.props['aria-describedby']).toBe('hint-a');
});

interface TestRadio {
    value: string;
    disabled?: boolean;
}

function mountRadioGroup(options: TestRadio[], initialValue?: string, groupProps: Record<string, unknown> = {}) {
    const value = ref(initialValue);
    let field: FormFieldController<string> | undefined;

    const RadioGroup = defineComponent({
        props: getRadioGroupProps<string>(),
        emits: getRadioGroupEmits<string>(),
        setup(props, { slots }) {
            field = useRadioGroup<string>(props).field;
            return () => slots.default?.();
        },
    });

    const RadioItem = defineComponent({
        props: getRadioProps<string>(),
        emits: getRadioEmits<string>(),
        setup(props) {
            const { Radio } = useRadio(props);
            return () => h(Radio, { id: `radio-${props.value}`, 'aria-describedby': `hint-${props.value}` });
        },
    });

    const root = createTestNode();
    const { createApp } = createRenderer<TestNode, TestNode>({
        createElement: () => createTestNode(),
        createText: text => createTestNode(text),
        createComment: () => createTestNode(),
        setText: (node, text) => {
            node.text = text;
        },
        setElementText: (node, text) => {
            node.children.splice(0, node.children.length, createTestNode(text));
        },
        insert: (child, parent, anchor) => {
            child.parent?.children.splice(child.parent.children.indexOf(child), 1);
            parent.children.splice(anchor ? parent.children.indexOf(anchor) : parent.children.length, 0, child);
            child.parent = parent;
        },
        remove: child => {
            child.parent?.children.splice(child.parent.children.indexOf(child), 1);
            child.parent = null;
        },
        parentNode: node => node.parent,
        nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
        patchProp: (node, key, _prev, next: unknown) => {
            node.props[key] = next;
        },
    });

    createApp({
        render: () =>
            h(
                RadioGroup,
                {
                    ...groupProps,
                    modelValue: value.value,
                    'onUpdate:modelValue': (newValue: string) => (value.value = newValue),
                },
                () => options.map(option => h(RadioItem, { key: option.value, ...option })),
            ),
    }).mount(root);

    return {
        radios: flatten(root).filter(node => node.props.role === 'radio'),
        value,
        field: assertValue(field),
    };
}

async function press(radio: TestNode, key: string) {
    fire(radio, 'onKeydown', { key });
    await nextTick();
}

function fire(radio: TestNode, listener: string, init: object) {
    const handler = radio.props[listener];
    if (typeof handler !== 'function') {
        throw new TypeError(`The radio has no ${listener} listener`);
    }

    handler(Object.assign(new Event(listener.slice(2).toLowerCase(), { cancelable: true }), init));
}

interface TestNode {
    text: string;
    parent: TestNode | null;
    readonly children: TestNode[];
    readonly props: Record<string, unknown>;
    readonly DOCUMENT_POSITION_FOLLOWING: number;
    focus(): void;
    compareDocumentPosition(other: TestNode): number;
}

/** A minimal host node for Vue's custom renderer: tracks the tree, props and focus. */
function createTestNode(text = '') {
    // Vue does not proxy DOM elements held in reactive state; a plain object would be.
    const node: TestNode = markRaw({
        text,
        parent: null,
        children: [],
        props: {},
        DOCUMENT_POSITION_FOLLOWING: 4,
        focus: () => {
            activeElement = node;
        },
        compareDocumentPosition: (other: TestNode) => {
            let root = node;
            while (root.parent) {
                root = root.parent;
            }

            const order = flatten(root);
            return order.indexOf(other) > order.indexOf(node) ? node.DOCUMENT_POSITION_FOLLOWING : 2;
        },
    });

    return node;
}

function flatten(node: TestNode): TestNode[] {
    return [node, ...node.children.flatMap(flatten)];
}
