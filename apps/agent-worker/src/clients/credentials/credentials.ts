import type { HostTarget } from "../hostJobs";

export interface TurnCredentials {
	sessionStore: { baseUrl: string; writeTicket: string };
	host: HostTarget & { workspaceId: string };
	model: { baseUrl: string; modelId: string; headers: Record<string, string> };
}

/** What a turn may touch, from the API's `agentWorker.turnCredentials`. */
export interface CredentialsProvider {
	forTurn(input: {
		sessionId: string;
		turnId: string;
	}): Promise<TurnCredentials>;
}
