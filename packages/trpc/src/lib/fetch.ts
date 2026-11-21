/** bun's `typeof fetch` also requires `preconnect`. */
export type Fetch = (
	...args: Parameters<typeof fetch>
) => ReturnType<typeof fetch>;
