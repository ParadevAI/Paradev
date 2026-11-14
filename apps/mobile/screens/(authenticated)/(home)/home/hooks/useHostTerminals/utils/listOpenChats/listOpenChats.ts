import type { ChatTransport } from "@superset/chat/client";

export interface OpenChat {
	sessionId: string;
	workspaceId: string;
	harness: string;
	harnessSessionId: string | null;
	title: string | null;
	status: string;
	updatedAt: number;
	/** An agent is behind the chat now; a finished chat resumes when opened. */
	live: boolean;
}

const LIST_LIMIT = 200;
const LIVE_LIMIT = 10;
const PROBE_BATCH = 10;
const PROBE_MAX = 50;

/**
 * The host's open chats, as desktop shows them: every chat until a person or
 * the host closes it, whether or not its agent is still running. A host from
 * before `listSessions` reported `live` is asked per session instead, newest
 * first, and only its running chats are shown.
 *
 * Pass `workspaceId` when only one workspace matters: the host-wide list is the
 * newest rows across every workspace, closed ones included, so a quiet
 * workspace's open chat can fall past the limit.
 */
export async function listOpenChats(
	transport: Pick<ChatTransport, "listSessions" | "getSession">,
	workspaceId?: string,
): Promise<OpenChat[]> {
	const rows = await transport.listSessions({
		limit: LIST_LIMIT,
		...(workspaceId ? { workspaceId } : {}),
	});
	const reportsLive = rows.some((row) => typeof row.live === "boolean");
	const open = reportsLive
		? rows.filter(
				(row) => row.live || (!row.closedAt && row.closedByUser !== true),
			)
		: (
				await probeLive(
					transport,
					rows.filter((row) => row.status !== "dead").slice(0, PROBE_MAX),
				)
			).map((row) => ({ ...row, live: true }));
	return open.map((row) => ({
		sessionId: row.sessionId,
		workspaceId: row.scopeId,
		harness: row.harness,
		harnessSessionId: row.harnessSessionId ?? null,
		title: row.title,
		status: row.status,
		updatedAt: row.updatedAt,
		live: row.live === true,
	}));
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
