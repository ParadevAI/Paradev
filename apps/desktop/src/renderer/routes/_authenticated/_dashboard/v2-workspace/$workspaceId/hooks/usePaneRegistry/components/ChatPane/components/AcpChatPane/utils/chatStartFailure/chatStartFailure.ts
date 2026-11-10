import type { StartFailure } from "../../../../../ChatSession/utils/startFailure";

export type ChatStartFailure =
	/** The host still reports the chat live, but its transcript says the agent never started. */
	| { path: "live"; detail: string; failure: StartFailure }
	/** The host stopped the chat, or lost it. */
	| { path: "stopped"; detail: string | undefined }
	/** No chat was created. */
	| { path: "create"; detail: string };

/** Why this pane's chat has no running agent, by the path that found out. */
export function chatStartFailure({
	canChat,
	sessionId,
	hasClient,
	recovering,
	liveStartFailure,
	sessionDead,
	sessionStopped,
	createFailure,
	storedError,
	stored,
}: {
	canChat: boolean;
	sessionId: string | null;
	hasClient: boolean;
	recovering: boolean;
	liveStartFailure: StartFailure | null;
	sessionDead: boolean;
	sessionStopped: boolean;
	createFailure: string | null;
	storedError: string | null | undefined;
	/** Null when the host has no such chat; undefined while it is asked. */
	stored: object | null | undefined;
}): ChatStartFailure | null {
	if (!canChat || recovering) return null;
	if (liveStartFailure) {
		return {
			path: "live",
			detail: liveStartFailure.detail,
			failure: liveStartFailure,
		};
	}
	const lost = createFailure !== null && stored === null;
	if (sessionId && (sessionDead || sessionStopped || lost)) {
		return {
			path: "stopped",
			detail: createFailure ?? storedError ?? undefined,
		};
	}
	if ((!hasClient || !sessionId) && createFailure) {
		return { path: "create", detail: createFailure };
	}
	return null;
}
