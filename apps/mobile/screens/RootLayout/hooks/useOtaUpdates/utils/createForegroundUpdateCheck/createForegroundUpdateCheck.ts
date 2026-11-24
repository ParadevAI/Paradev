interface ForegroundUpdateCheckOptions {
	minIntervalMs: number;
	now: () => number;
	download: () => void;
}

export function createForegroundUpdateCheck({
	minIntervalMs,
	now,
	download,
}: ForegroundUpdateCheckOptions) {
	let lastCheckedAt = now();
	return (status: string) => {
		if (status !== "active") return;
		if (now() - lastCheckedAt < minIntervalMs) return;
		lastCheckedAt = now();
		download();
	};
}
