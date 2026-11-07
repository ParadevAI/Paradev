import type { ChatSelections } from "@superset/chat/core";
import type {
	Decision,
	Delta,
	DiscoverSessionsResult,
	Item,
	SessionState,
	Turn,
	UserContent,
} from "@superset/chat/protocol";

export type AdapterEvent =
	| { kind: "item"; item: Item; turnId: string }
	| { kind: "delta"; delta: Delta }
	| { kind: "turn"; turn: Turn }
	| { kind: "session"; session: Partial<SessionState> };

export type AttachmentPart = Extract<UserContent, { type: "attachment" }>;

/** `data` is an image's bytes, base64; empty for any other file, which goes by `path`. */
export type ResolvedAttachment = {
	path: string;
	mimeType: string;
	data: string;
};

/** Null when the bytes cannot be had: the adapter tells the agent so. */
export type ResolveAttachment = (
	part: AttachmentPart,
) => Promise<ResolvedAttachment | null>;

export type HarnessStartOptions = ChatSelections & {
	cwd: string;
	/** `quiet` loads the agent's history without replaying it as items. */
	resume?: { harnessSessionId: string; quiet?: boolean };
};

/** Asks a harness for its own history. Must not open a session. */
export type DiscoverNativeSessionsInput = {
	cwd: string;
	cursor?: string;
};

export interface HarnessAdapter {
	start(options: HarnessStartOptions): AsyncIterable<AdapterEvent>;
	prompt(content: UserContent[]): void;
	cancelTurn(): void;
	canSteer?(): boolean;
	/** Resolves false when the agent did not accept the prompt, so the caller queues it. */
	steer?(content: UserContent[]): Promise<boolean>;
	respondToApproval(approvalId: string, decision: Decision): void;
	/** Resolves false when the agent refused the mode. */
	setMode(modeId: string): Promise<boolean>;
	/** The start model, effort and mode the agent took. */
	startSelections?(): Promise<ChatSelections>;
	/** Resolves false when the agent refused the change. */
	setConfigOption?(configId: string, value: string): Promise<boolean>;
	/**
	 * Branch this session, returning the harness id of the copy. Absent, or
	 * null, when the harness cannot: the agent has to advertise it.
	 */
	/** With `upToMessageId`, keeps the conversation only through that message, or returns null when it cannot. */
	fork?(cut?: { upToMessageId: string }): Promise<string | null>;
	stopBackgroundTask?(taskId: string): Promise<boolean>;
	steerSubagent?(taskId: string, content: UserContent[]): Promise<boolean>;
	backgroundSubagent?(taskId: string): Promise<boolean>;
	/**
	 * Lists the harness's own sessions. Absent when this harness has no native
	 * history. `supported: false` means the process answered but cannot list.
	 */
	discoverSessions?(
		input: DiscoverNativeSessionsInput,
	): Promise<DiscoverSessionsResult>;
	dispose(): Promise<void>;
}
