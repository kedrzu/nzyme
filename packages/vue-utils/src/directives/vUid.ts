import type { ObjectDirective } from 'vue';

/**
 * Source: https://github.com/shimyshack/uid
 */
export const vUid: ObjectDirective<Element> = {
    created(el) {
        el.setAttribute('id', el.id || randomId());
    },
    getSSRProps() {
        return {
            id: randomId(),
        };
    },
};

function randomId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
