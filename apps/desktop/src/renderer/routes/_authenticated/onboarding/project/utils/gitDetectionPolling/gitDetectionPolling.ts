interface GitDetectionQuery {
	state: {
		data?: { installed: boolean };
		dataUpdatedAt: number;
	};
}

// Apple's installer has focus while it runs, so polling must not stop on blur.
export function gitDetectionPolling({
	reportedAt,
	intervalMs,
}: {
	reportedAt: number | null;
	intervalMs: number;
}) {
	return {
		refetchInterval: (query: GitDetectionQuery) =>
			query.state.data?.installed === false ||
			(reportedAt !== null && query.state.dataUpdatedAt <= reportedAt)
				? intervalMs
				: false,
		refetchIntervalInBackground: true,
	};
}
