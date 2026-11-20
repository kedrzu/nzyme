import type { OutlinePage, OutlinePageParams } from './OutlineTypes.js';

const PAGE_SIZE = 100;

/**
 * Collects every item of a paginated Outline list by walking `limit`/`offset` pages of the maximum size
 * until one comes back short.
 * @util
 */
export async function listAll<T>(fetchPage: (page: Required<OutlinePageParams>) => Promise<OutlinePage<T>>) {
    const items: T[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await fetchPage({ limit: PAGE_SIZE, offset });
        items.push(...page.data);
        if (page.data.length < PAGE_SIZE) {
            return items;
        }
    }
}
