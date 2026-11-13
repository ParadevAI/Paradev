/** Polls until the sign-in is approved, waiting `intervalMs` before each check; rejects on abort. */
export async function waitForApproval({
	poll,
	intervalMs,
	signal,
}: {
	poll: () => Promise<{ status: string }>;
	intervalMs: number;
	signal: AbortSignal;
}): Promise<void> {
	for (;;) {
		await new Promise<void>((resolve, reject) => {
			const onAbort = () => {
				clearTimeout(timer);
				reject(signal.reason);
			};
			const timer = setTimeout(() => {
				signal.removeEventListener("abort", onAbort);
				resolve();
			}, intervalMs);
			signal.addEventListener("abort", onAbort, { once: true });
		});
		signal.throwIfAborted();
		if ((await poll()).status === "connected") return;
	}
}
