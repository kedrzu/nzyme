import type { ObjectDirective } from 'vue';

/**
 * Vue directive that automatically assigns a unique ID to an element if it doesn't already have one.
 *
 * @example
 * ```vue
 * <template>
 *   <!-- Element will get a unique ID like "1a2b3c4d5e" -->
 *   <div v-uid ref="myElement">Content</div>
 *
 *   <!-- Element keeps its existing ID -->
 *   <div v-uid id="my-id" ref="existingIdElement">Content</div>
 * </template>
 *
 * <script setup>
 * import { ref, onMounted } from 'vue';
 *
 * const myElement = ref();
 * const existingIdElement = ref();
 *
 * onMounted(() => {
 *   console.log(myElement.value.id); // "1a2b3c4d5e" (generated ID)
 *   console.log(existingIdElement.value.id); // "my-id" (existing ID)
 * });
 * </script>
 * ```
 *
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
