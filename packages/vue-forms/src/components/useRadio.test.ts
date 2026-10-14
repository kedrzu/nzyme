import { expect, test } from 'bun:test';
import { createRenderer, defineComponent, h, markRaw, nextTick, ref } from 'vue';

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

test('useRadio passes attributes through to the button', () => {
    const { radios } = mountRadioGroup([{ value: 'a' }]);

    expect(radios[0]!.props.id).toBe('radio-a');
    expect(radios[0]!.props['aria-describedby']).toBe('hint-a');
});

interface TestRadio {
    value: string;
    disabled?: boolean;
}

function mountRadioGroup(options: TestRadio[], initialValue?: string) {
    const value = ref(initialValue);

    const RadioGroup = defineComponent({
        props: getRadioGroupProps<string>(),
        emits: getRadioGroupEmits<string>(),
        setup(props, { slots }) {
            useRadioGroup(props);
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
                    modelValue: value.value,
                    'onUpdate:modelValue': (newValue: string) => (value.value = newValue),
                },
                () => options.map(option => h(RadioItem, { key: option.value, ...option })),
            ),
    }).mount(root);

    return { radios: flatten(root).filter(node => node.props.role === 'radio'), value };
}

async function press(radio: TestNode, key: string) {
    const onKeydown = radio.props.onKeydown;
    if (typeof onKeydown !== 'function') {
        throw new TypeError('The radio has no keydown listener');
    }

    onKeydown(Object.assign(new Event('keydown', { cancelable: true }), { key }));
    await nextTick();
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
