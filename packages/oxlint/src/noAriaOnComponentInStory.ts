import { isNode } from './isNode.js';
import type { OxlintJsxMemberExpression, OxlintNode, OxlintRule } from './oxlintTypes.js';

const MESSAGE_ID = 'ariaOnComponent';

/**
 * Reports an `aria-*` attribute passed to a component, as in `<Button aria-label="Close" />`.
 *
 * In a story such an attribute can make an axe failure go away without the component ever becoming
 * accessible, and the next consumer ships the same violation. A component that inherently needs an
 * accessible name takes a dedicated prop whose default comes from its translations. Native elements
 * are fine: a story legitimately builds fixtures from them.
 *
 * A component is a member expression (`<Foo.Bar>`) or an identifier starting with an uppercase
 * letter; lowercase names, custom elements (`<my-el>`) and namespaced names (`<svg:rect>`) are
 * native. The rule never looks at the filename — the preset scopes it to stories through an
 * `overrides` entry. Deliberately out of scope: spread attributes
 * (`{...{ 'aria-label': 'x' }}`) and `h(Button, { 'aria-label': … })`.
 */
export const noAriaOnComponentInStory: OxlintRule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow passing `aria-*` attributes to a component in a story.',
        },
        messages: {
            [MESSAGE_ID]:
                '`{{attribute}}` is passed to `<{{tag}}>` in a story. Fix the component rather than the story: it must be accessible on its own, and a component that needs an accessible name takes a prop with a translated default.',
        },
    },
    create(context) {
        return {
            JSXOpeningElement(node) {
                const tag = componentName(node.name);
                if (tag == null) {
                    return;
                }

                for (const attribute of node.attributes) {
                    if (!isNode(attribute, 'JSXAttribute') || !isNode(attribute.name, 'JSXIdentifier')) {
                        continue;
                    }

                    if (attribute.name.name.startsWith('aria-')) {
                        context.report({
                            messageId: MESSAGE_ID,
                            node: attribute,
                            data: { attribute: attribute.name.name, tag },
                        });
                    }
                }
            },
        };
    },
};

/** The tag as written, when it names a component; `undefined` for a native element. */
function componentName(name: OxlintNode): string | undefined {
    if (isNode(name, 'JSXMemberExpression')) {
        return memberExpressionText(name);
    }

    if (isNode(name, 'JSXIdentifier') && /^\p{Lu}/u.test(name.name)) {
        return name.name;
    }

    return undefined;
}

function memberExpressionText({ object, property }: OxlintJsxMemberExpression): string {
    const objectText = object.type === 'JSXMemberExpression' ? memberExpressionText(object) : object.name;

    return `${objectText}.${property.name}`;
}
