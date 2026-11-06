import type { ChatTransport } from "@superset/chat/client";

export interface HostChat {
	sessionId: string;
	workspaceId: string;
	harness: string;
	harnessSessionId: string | null;
	title: string | null;
	status: string;
	updatedAt: number;
	live: boolean;
}

type ListedChat = Awaited<ReturnType<ChatTransport["listSessions"]>>[number];

const LIST_LIMIT = 200;
const LIVE_LIMIT = 10;
const PROBE_BATCH = 10;
const PROBE_MAX = 50;

/**
 * The host's chats that are still open: running ones, and ones whose agent
 * stopped without anyone closing them, as a host restart leaves them. Those
 * resume when opened. Resuming makes a new session on the same agent session,
 * so a stopped chat is left out once another chat carries its agent session.
 * A host from before `listSessions` reported `live` is asked per session
 * instead, newest first, and shows only running chats.
 */
export async function listWorkspaceChats(
	transport: Pick<ChatTransport, "listSessions" | "getSession">,
): Promise<HostChat[]> {
	const rows = await transport.listSessions({ limit: LIST_LIMIT });
	const reportsLive = rows.some((row) => typeof row.live === "boolean");
	if (!reportsLive) {
		const live = await probeLive(
			transport,
			rows.filter((row) => row.status !== "dead").slice(0, PROBE_MAX),
		);
		return live.map((row) => toHostChat(row, true));
	}

	const live = rows.filter((row) => row.live);
	const carried = new Set(live.map(agentSessionKey));
	const stopped: ListedChat[] = [];
	for (const row of rows) {
		if (row.live || !row.harnessSessionId || !neverClosed(row)) continue;
		const key = agentSessionKey(row);
		if (carried.has(key)) continue;
		carried.add(key);
		stopped.push(row);
	}
	return [
		...live.map((row) => toHostChat(row, true)),
		...stopped.map((row) => toHostChat(row, false)),
	];
}

function neverClosed(row: ListedChat): boolean {
	return row.closedAt === null || row.closedAt === 0;
}

function agentSessionKey(row: ListedChat): string {
	return `${row.harness}:${row.harnessSessionId ?? row.sessionId}`;
}

function toHostChat(row: ListedChat, live: boolean): HostChat {
	return {
		sessionId: row.sessionId,
		workspaceId: row.scopeId,
		harness: row.harness,
		harnessSessionId: row.harnessSessionId,
		title: row.title,
		status: row.status,
		updatedAt: row.updatedAt,
		live,
	};
}

async function probeLive<Row extends { sessionId: string }>(
	transport: Pick<ChatTransport, "getSession">,
	rows: Row[],
): Promise<Row[]> {
	const live: Row[] = [];
	for (
		let start = 0;
		start < rows.length && live.length < LIVE_LIMIT;
		start += PROBE_BATCH
	) {
		const batch = rows.slice(start, start + PROBE_BATCH);
		const answers = await Promise.all(
			batch.map((row) =>
				transport
					.getSession({ sessionId: row.sessionId })
					.then((result) => result.live)
					.catch(() => false),
			),
		);
		live.push(...batch.filter((_, index) => answers[index]));
	}
	return live.slice(0, LIVE_LIMIT);
}
