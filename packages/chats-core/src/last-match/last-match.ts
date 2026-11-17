/** `Array.prototype.findLast`, for packages still compiled against ES2022. */
export function lastMatch<T>(
	items: readonly T[],
	test: (item: T) => unknown,
): T | undefined {
	for (let index = items.length - 1; index >= 0; index--) {
		const item = items[index] as T;
		if (test(item)) return item;
	}
	return undefined;
}
