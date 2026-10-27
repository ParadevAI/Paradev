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

/** Records a finished turn. `steerPending` asks for one more step: a message joined after the last one. */
export interface TurnSettler {
	settle(input: SettleTurnInput): Promise<{ steerPending: boolean }>;
}
