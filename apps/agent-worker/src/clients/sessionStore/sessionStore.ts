import type { AcpUpdate } from "@superset/agent-harness";

export interface TurnEnd {
	id: string;
	status: "running" | "completed" | "failed" | "interrupted";
	startedAtMs: number;
	completedAtMs?: number;
	error?: { message: string };
}

export interface AppendInput {
	stepKey: string;
	turnId: string;
	turnStart?: { startedAtMs: number };
	acp?: AcpUpdate[];
	transcript?: unknown[];
	turnEnd?: TurnEnd;
}

export interface TranscriptRow {
	seq: number;
	stepKey: string;
	entry: unknown;
}

/** The session's Durable Object store in apps/realtime, as the worker writes it. */
export interface SessionStore {
	append(input: AppendInput): Promise<{ duplicate: boolean }>;
	transcript(): Promise<TranscriptRow[]>;
	transcriptStep(stepKey: string): Promise<TranscriptRow[]>;
}

export function httpSessionStore(options: {
	baseUrl: string;
	sessionId: string;
	/** Read per request, so a long step picks up a refreshed ticket. */
	writeTicket: () => Promise<string>;
	fetch?: typeof fetch;
}): SessionStore {
	const fetcher = options.fetch ?? fetch;
	const url = (path: string) =>
		`${options.baseUrl}/v2/agent-runtime/sessions/${encodeURIComponent(options.sessionId)}/${path}`;
	const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
		const response = await fetcher(url(path), {
			...init,
			headers: {
				Authorization: `Bearer ${await options.writeTicket()}`,
				...(init?.headers ?? {}),
			},
		});
		if (!response.ok) {
			throw new Error(
				`Session store ${path} failed: ${response.status} ${await response.text()}`,
			);
		}
		return (await response.json()) as T;
	};

	return {
		append: (input) =>
			request("append", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(input),
			}),
		async transcript() {
			const rows: TranscriptRow[] = [];
			for (;;) {
				const after = rows.at(-1)?.seq ?? 0;
				const page = await request<{ entries: TranscriptRow[] }>(
					`transcript?after=${after}`,
				);
				rows.push(...page.entries);
				if (page.entries.length === 0) return rows;
			}
		},
		async transcriptStep(stepKey) {
			const page = await request<{ entries: TranscriptRow[] }>(
				`transcript?stepKey=${encodeURIComponent(stepKey)}`,
			);
			return page.entries;
		},
	};
}
