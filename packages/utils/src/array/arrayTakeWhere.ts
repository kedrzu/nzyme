export function arrayTakeWhere<T>(array: T[], predicate: (item: T) => boolean) {
    const items: T[] = [];
    for (let i = 0; i < array.length; i++) {
        const item = array[i];
        if (item !== undefined && predicate(item)) {
            array.splice(i, 1);
            i--;
            items.push(item);
        }
    }

    return items;
}
