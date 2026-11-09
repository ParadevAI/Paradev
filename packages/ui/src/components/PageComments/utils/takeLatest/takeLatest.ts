/** Tags each result with whether a later call started before it settled. */
export function takeLatest() {
	let started = 0;
	return async <T>(
		promise: Promise<T>,
	): Promise<{ value: T; latest: boolean }> => {
		const ticket = ++started;
		const value = await promise;
		return { value, latest: ticket === started };
	};
}
