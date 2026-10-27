import type { HostTarget } from "../hostJobs";

export interface TurnCredentials {
	sessionStore: { baseUrl: string; writeTicket: string };
	/** Null when the session has no workspace: the turn runs with no tools. */
	host: (HostTarget & { workspaceId: string }) | null;
	/** The room people read the session in; replies go there through post_message. */
	room?: { channelId: string; threadRootId: string | null } | null;
	/** The Dev's token for the API, to post in the room as itself. */
	agentToken?: string;
	model: { baseUrl: string; modelId: string; headers: Record<string, string> };
}

/** What a turn may touch, from the API's `agentWorker.turnCredentials`. */
export interface CredentialsProvider {
	forTurn(input: {
		sessionId: string;
		turnId: string;
	}): Promise<TurnCredentials>;
}
