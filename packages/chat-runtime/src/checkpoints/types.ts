export type TurnCheckpointTarget = {
	cwd: string;
	sessionId: string;
	turnId: string;
};

/**
 * A resumed chat replays its history under new session and turn ids, but the
 * agent's own session and tool call ids stay; a settled turn is found again
 * by those.
 */
export type TurnAnchors = {
	harnessSessionId?: string;
	anchorItemIds?: string[];
};

export type TurnChangedFile = {
	/** Relative to the repository root. */
	path: string;
	status: "added" | "modified" | "deleted";
	/** Null for a binary file. */
	additions: number | null;
	deletions: number | null;
};

export type TurnChanges = {
	/** The repository root the paths are relative to. */
	root: string;
	before: string;
	after: string;
	files: TurnChangedFile[];
	/** Another chat in the same worktree ran a turn at the same time. */
	shared: boolean;
	/** `after` is a snapshot of a turn still running. */
	live: boolean;
	/** Its file changes were undone. */
	undone: boolean;
	/** Files that Undo left alone, because they had changed again since. */
	undoSkipped?: string[];
	/** Files whose turn result HEAD now holds, with nothing left to commit. */
	committed: string[];
};

export type TurnUndoResult =
	| {
			status: "undone";
			restored: string[];
			/** Changed again since the turn, by anyone, so left as they are. */
			skipped: string[];
	  }
	| {
			status: "refused";
			reason: "busy" | "head-moved" | "missing" | "shared" | "unsupported";
	  };

/**
 * Snapshots of the worktree around each turn, kept as commits under hidden
 * refs, so what a turn changed is exact and includes edits made by shell
 * commands.
 */
export type ChatCheckpoints = {
	/** Snapshots the worktree before a prompt reaches the agent; null when it cannot. */
	capture(input: { cwd: string; sessionId: string }): Promise<string | null>;
	/** A prompt started this turn; `before` is the snapshot taken for it, if any. */
	turnStarted(
		input: TurnCheckpointTarget & { before: string | null },
	): Promise<void>;
	/** `anchor` is the turn's first tool call, kept to find the turn after a resume. */
	turnSettled(
		input: TurnCheckpointTarget & { anchor?: TurnAnchor },
	): Promise<void>;
	/** Null when the turn has no snapshots. A running turn is compared with the worktree now. */
	changes(
		input: TurnCheckpointTarget & TurnAnchors & { live: boolean },
	): Promise<TurnChanges | null>;
	/** Puts `paths` back as the turn found them, skipping any changed since. */
	undo(
		input: TurnCheckpointTarget & TurnAnchors & { paths: string[] },
	): Promise<TurnUndoResult>;
};

/** One session's view of the checkpoints, bound to its worktree. */
export type SessionCheckpoints = {
	capture(): Promise<string | null>;
	turnStarted(turnId: string, before: string | null): void;
	turnSettled(turnId: string, anchor?: TurnAnchor): void;
};

export type TurnAnchor = { harnessSessionId: string; itemId: string };
