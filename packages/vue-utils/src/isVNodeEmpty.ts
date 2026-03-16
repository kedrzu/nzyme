import type { VNodeChild } from 'vue';
import { Comment, Fragment, Text } from 'vue';

/** Checks whether a VNode is empty (null, undefined, empty string, comment, or empty fragment). */
export function isVNodeEmpty(node: VNodeChild): boolean {
    switch (typeof node) {
        case 'boolean':
        case 'number':
            return false;
        case 'string':
            return node.trim() === '';
        case 'undefined':
            return true;
    }

    if (node === null) {
        return true;
    }

    if (Array.isArray(node)) {
        return node.length === 0 || node.every(isVNodeEmpty);
    }

    switch (node.type) {
        case Comment:
            return true;
        case Fragment: {
            const children = node.children;
            return children == null || children.length === 0;
        }
        case Text:
            if (node.children == null || node.children.length === 0) {
                return true;
            }

            if (typeof node.children === 'string') {
                return node.children.trim() === '';
            }
            return true;
    }

    return false;
}
