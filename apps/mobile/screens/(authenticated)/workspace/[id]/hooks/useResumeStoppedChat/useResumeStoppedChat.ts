import { rawErrorMessage } from "@superset/i18n/errors";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { getChatTransport } from "@/lib/chat";
import { posthog } from "@/lib/posthog";
import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { resumeChat } from "../../utils/resumeChat";

export interface ResumeStoppedChat {
	failure: unknown;
	retry: () => void;
}

/**
 * Resumes the active chat when its agent stopped without anyone closing it,
 * the way desktop resumes a pane it reopens. Each chat is tried once until
 * `retry`; `onResumed` gets the chat that takes over.
 */
export function useResumeStoppedChat({
	row,
	hostUrl,
	workspaceId,
	onResumed,
}: {
	row: TerminalRowData | undefined;
	hostUrl: string | null;
	workspaceId: string | undefined;
	onResumed: (sessionId: string) => void;
}): ResumeStoppedChat {
	const attempted = useRef(new Set<string>());
	const [failure, setFailure] = useState<{
		sessionId: string;
		error: unknown;
	} | null>(null);
	const [attempt, setAttempt] = useState(0);

	const sessionId = row?.kind === "chat" ? row.terminalId : null;
	const stopped = row?.stopped ?? null;

	useEffect(() => {
		if (!sessionId || !stopped || !hostUrl || !workspaceId) return;
		const key = `${sessionId}#${attempt}`;
		if (attempted.current.has(key)) return;
		attempted.current.add(key);
		setFailure(null);
		resumeChat(getChatTransport(hostUrl), {
			commandId: randomUUID(),
			workspaceId,
			sessionId,
			harness: stopped.harness,
			harnessSessionId: stopped.harnessSessionId,
		}).then(
			(resumed) => {
				posthog.capture("chat_resumed", {
					workspace_id: workspaceId,
					harness: stopped.harness,
				});
				onResumed(resumed);
			},
			(error: unknown) => {
				posthog.capture("chat_resume_failed", {
					workspace_id: workspaceId,
					harness: stopped.harness,
					error: rawErrorMessage(error),
				});
				setFailure({ sessionId, error });
			},
		);
	}, [sessionId, stopped, hostUrl, workspaceId, onResumed, attempt]);

	const retry = useCallback(() => setAttempt((count) => count + 1), []);

	return {
		failure: failure && failure.sessionId === sessionId ? failure.error : null,
		retry,
	};
}
