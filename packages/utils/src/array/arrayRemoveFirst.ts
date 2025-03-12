export function arrayRemoveFirst<T>(array: T[], predicate: (item: T) => boolean) {
    for (let i = 0; i < array.length; i++) {
        const item = array[i];
        if (item !== undefined && predicate(item)) {
            array.splice(i, 1);
            return item;
        }
    }
}
