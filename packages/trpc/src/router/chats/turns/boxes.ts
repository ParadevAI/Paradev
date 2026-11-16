/** A Dev's running sandbox. */
export interface Box {
	id: string;
	expiresAt?: Date;
}

/** Where Devs run: one box per Dev, woken for a turn and stopped when idle. */
export interface BoxProvider {
	wake(agentId: string, opts: { boxId: string }): Promise<Box>;
	/** The Dev's running box, or null when it has none. */
	status(agentId: string): Promise<Box | null>;
	stop(agentId: string): Promise<void>;
}

export interface TurnStart {
	turnId: string;
	agentId: string;
	groupId: string;
	/** The chat's session on the box: one per chat, so a Dev keeps each conversation apart. */
	sessionId: string;
	text: string;
	/** Ask the Dev once, when it ends with words but no reply, whether they were meant for the chat. */
	checkReply: boolean;
}

/** The API's side of the runner inside a box. A started turn reports back by replying and settling. */
export interface RunnerClient {
	start(box: Box, turn: TurnStart): Promise<void>;
	cancel(box: Box, opts: { sessionId: string }): Promise<void>;
}
