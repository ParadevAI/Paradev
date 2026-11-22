/** The item at `index`; a test fails here, by name, when the list is shorter than it expects. */
export function at<T>(items: readonly T[], index = 0): T {
	const item = items[index];
	if (item === undefined) {
		throw new Error(`expected an item at ${index}; got ${items.length}`);
	}
	return item;
}
