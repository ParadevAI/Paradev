/** Same length and the same element at every index, so a rebuilt list can keep its old identity. */
export function sameItems<T>(
	next: readonly T[],
	previous: readonly T[],
): boolean {
	return (
		next.length === previous.length &&
		next.every((item, index) => item === previous[index])
	);
}
