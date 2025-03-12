export function arrayRemoveWhere<T>(array: T[], predicate: (item: T) => boolean) {
    let count = 0;
    for (let i = 0; i < array.length; i++) {
        if (predicate(array[i]!)) {
            array.splice(i, 1);
            i--;
            count++;
        }
    }

    return count;
}
