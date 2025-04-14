/**
 * Shuffles the elements of an array in place using the Fisher-Yates algorithm.
 *
 * @template T - The type of elements in the array
 * @param array - The array to shuffle
 * @returns The same array with its elements shuffled
 */
export function shuffleArray<T>(array: T[]) {
    let currentIndex = array.length,
        randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex > 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex]!, array[currentIndex]!];
    }

    return array;
}
