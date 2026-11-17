/** A Dev's running sandbox. */
export interface Box {
	id: string;
	/** Where the box's runner listens, as the API reaches it. */
	url: string;
	expiresAt?: Date;
}

export interface WakeOptions {
	boxId: string;
	/** Added by the box's network proxy to its requests to the API. It never enters the box. */
	credential: string;
	env: Record<string, string>;
}

/** Where Devs run: one box per Dev, woken for a turn and stopped when idle. */
export interface BoxProvider {
	wake(agentId: string, opts: WakeOptions): Promise<Box>;
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
	/**
	 * The turn is in the owner's 1:1 with their own Dev: the only chat where
	 * the box loads what the Dev keeps privately about its owner.
	 */
	ownerOneToOne: boolean;
	/** The chat around the turn: its latest messages, oldest first, and who is in it. */
	chat: {
		recent: { line: string; seen: boolean }[];
		roster: string;
	};
}

/** The API's side of the runner inside a box. A started turn reports back by replying and settling. */
export interface RunnerClient {
	start(box: Box, turn: TurnStart): Promise<void>;
	cancel(box: Box, opts: { sessionId: string }): Promise<void>;
}
