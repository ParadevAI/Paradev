import {
	PEEC_ACCESS_LOG_URL,
	PEEC_MAX_ENTRIES_PER_REQUEST,
	PEEC_REQUEST_TIMEOUT_MS,
} from "./constants";
import type { AccessLogEntry } from "./toAccessLogEntries";

export function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

export interface ForwardFailure {
	entries: number;
	status?: number;
	error?: string;
}

export async function forwardAccessLogs({
	entries,
	apiKey,
	organizationId,
	fetchImpl = fetch,
	timeoutMs = PEEC_REQUEST_TIMEOUT_MS,
}: {
	entries: AccessLogEntry[];
	apiKey: string;
	organizationId: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<ForwardFailure[]> {
	const results = await Promise.all(
		chunk(entries, PEEC_MAX_ENTRIES_PER_REQUEST).map(
			async (batch): Promise<ForwardFailure | null> => {
				try {
					const response = await fetchImpl(PEEC_ACCESS_LOG_URL, {
						method: "POST",
						headers: {
							Authorization: `Bearer ${apiKey}`,
							"x-org-id": organizationId,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(batch),
						signal: AbortSignal.timeout(timeoutMs),
					});
					if (response.ok) return null;
					return { entries: batch.length, status: response.status };
				} catch (error) {
					return {
						entries: batch.length,
						error: error instanceof Error ? error.name : "unknown",
					};
				}
			},
		),
	);
	return results.filter((result) => result !== null);
}
