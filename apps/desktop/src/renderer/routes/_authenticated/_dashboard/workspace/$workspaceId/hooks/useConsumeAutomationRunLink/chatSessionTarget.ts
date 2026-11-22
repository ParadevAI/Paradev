import type { ChatTransport } from "@superset/chat/client";
import { presetForAcpHarness } from "@superset/chat/core";
import type { ChatSessionTarget } from "../../utils/focusChatSession";

type SessionResult = Awaited<ReturnType<ChatTransport["getSession"]>>;
type SessionList = Awaited<ReturnType<ChatTransport["listSessions"]>>;

export function chatSessionTarget({
	result,
	sessions,
	sessionId,
	workspaceId,
}: {
	result: SessionResult;
	sessions: SessionList;
	sessionId: string;
	workspaceId: string;
}): ChatSessionTarget | null {
	const session = result.session;
	if (session?.sessionId !== sessionId || session.scopeId !== workspaceId)
		return null;
	const presetId = presetForAcpHarness(session.harness);
	if (!presetId) return null;
	const live = result.live
		? sessions.find((entry) => entry.sessionId === sessionId && entry.live)
		: undefined;
	return {
		sessionId,
		presetId,
		harnessSessionId: session.harnessSessionId ?? undefined,
		terminalId: live?.terminalId ?? undefined,
		title: session.title ?? undefined,
	};
}
