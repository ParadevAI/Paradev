export interface BuildStatus {
	id: string;
	status: "running" | "succeeded" | "failed";
	error: string | null;
}

/** Polls one build until it finishes or `timeoutMs` passes; null on timeout. */
export async function waitForBuild<T extends BuildStatus>(args: {
	buildId: string;
	fetchBuilds: () => Promise<readonly T[]>;
	intervalMs?: number;
	timeoutMs?: number;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}): Promise<T | null> {
	const intervalMs = args.intervalMs ?? 5_000;
	const sleep =
		args.sleep ??
		((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const now = args.now ?? Date.now;
	const deadline = now() + (args.timeoutMs ?? 10 * 60_000);
	while (now() <= deadline) {
		const build = (await args.fetchBuilds()).find(
			(candidate) => candidate.id === args.buildId,
		);
		if (build && build.status !== "running") return build;
		await sleep(intervalMs);
	}
	return null;
}
