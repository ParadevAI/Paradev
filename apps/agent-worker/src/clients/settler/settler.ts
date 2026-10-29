export interface SettleTurnInput {
	turnId: string;
	status: "completed" | "failed" | "interrupted";
	reply?: string;
	toolCalls?: Array<{
		name: string;
		summary: string;
		status: "done" | "failed" | "cancelled";
	}>;
	inputTokens?: number;
	outputTokens?: number;
	costMicrosUsd?: number;
	errorCode?: string;
	/** How many steers the worker read into the turn. */
	steersConsumed: number;
}

export interface SessionStoreAccess {
	baseUrl: string;
	writeTicket: string;
}

/**
 * Records a finished turn. `steerPending` asks for one more step: a message
 * joined after the last one. A turn already settled answers like a fresh settle.
 */
export interface TurnSettler {
	/** An attempt failed and will run again. */
	noteRetry?(input: {
		turnId: string;
		attempt: number;
		error: string;
	}): Promise<void>;
	settle(
		input: SettleTurnInput,
	): Promise<
		| { steerPending: true }
		| { steerPending: false; sessionStore: SessionStoreAccess }
	>;
}
