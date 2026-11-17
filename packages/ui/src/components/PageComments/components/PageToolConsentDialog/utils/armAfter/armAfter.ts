export function armAfter(
	delayMs: number,
	arm: () => void,
	schedule: (run: () => void, ms: number) => unknown = setTimeout,
	cancel: (handle: unknown) => void = (handle) =>
		clearTimeout(handle as ReturnType<typeof setTimeout>),
): () => void {
	const handle = schedule(arm, delayMs);
	return () => cancel(handle);
}
