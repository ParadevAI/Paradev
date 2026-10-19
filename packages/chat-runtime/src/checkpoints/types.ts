export type CheckpointTarget = {
	cwd: string;
	sessionId: string;
	itemId: string;
};

export type RewindFilesResult = {
	files: "restored" | "missing" | "unsupported";
};

export type RewindChange = {
	path: string;
	change: "added" | "modified" | "deleted";
};

/** What a files rewind to a message would undo, without undoing it. */
export type RewindChangesResult =
	| { files: "listed"; changes: RewindChange[] }
	| { files: "missing" | "unsupported" };

export type RewindSupport = {
	files: boolean;
};

/** Snapshots of the working tree, taken just before each prompt reaches the agent. */
export type ChatCheckpoints = {
	capture(target: CheckpointTarget): Promise<void>;
	restore(target: CheckpointTarget): Promise<"restored" | "missing">;
	/** Files that differ from the checkpoint, or null when there is none. */
	changes?(target: CheckpointTarget): Promise<RewindChange[] | null>;
	/** Whether this directory can be snapshotted at all. */
	available?(cwd: string): Promise<boolean>;
	/** Lets a session opened by a rewind restore the checkpoints of the one it came from. */
	fork?(input: {
		cwd: string;
		fromSessionId: string;
		toSessionId: string;
	}): Promise<void>;
};
