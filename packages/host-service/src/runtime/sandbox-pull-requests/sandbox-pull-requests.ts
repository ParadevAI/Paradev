const SETTLE_MS = 1_000;
const MIN_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60 * 1000;
const BATCH_SIZE = 200;

interface LinkedPullRequest {
	repository: string;
	number: number;
	linkedAt: number;
}

const keyOf = (pullRequest: LinkedPullRequest) =>
	`${pullRequest.repository.toLowerCase()}#${pullRequest.number}`;

export function startSandboxPullRequestReporter(args: {
	read: () => Promise<LinkedPullRequest[]>;
	report: (pullRequests: LinkedPullRequest[]) => Promise<{ ignored: string[] }>;
	onLinked: (listener: () => void) => () => void;
}): () => void {
	const sent = new Set<string>();
	let retryMs = MIN_RETRY_MS;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let running = false;
	let rerun = false;
	let stopped = false;

	const sendUnsent = async () => {
		timer = null;
		if (running) {
			rerun = true;
			return;
		}
		running = true;
		try {
			const unsent = (await args.read()).filter((pr) => !sent.has(keyOf(pr)));
			for (let i = 0; i < unsent.length && !stopped; i += BATCH_SIZE) {
				const batch = unsent.slice(i, i + BATCH_SIZE);
				const { ignored } = await args.report(batch);
				for (const pullRequest of batch) sent.add(keyOf(pullRequest));
				if (ignored.length > 0) {
					console.warn(
						"[sandbox-pull-requests] not this workspace's repositories:",
						ignored.join(", "),
					);
				}
			}
			retryMs = MIN_RETRY_MS;
		} catch (error) {
			console.warn(
				"[sandbox-pull-requests] report failed:",
				error instanceof Error ? error.message : error,
			);
			schedule(retryMs);
			retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
		} finally {
			running = false;
		}
		if (rerun) {
			rerun = false;
			schedule(SETTLE_MS);
		}
	};

	const schedule = (wait: number) => {
		if (stopped || timer) return;
		timer = setTimeout(() => void sendUnsent(), wait);
	};

	const unsubscribe = args.onLinked(() => schedule(SETTLE_MS));
	void sendUnsent();
	return () => {
		stopped = true;
		unsubscribe();
		if (timer) clearTimeout(timer);
	};
}
