/** Normalized comment shape, flattened from review threads + conversation comments. */
export interface NormalizedComment {
	id: string;
	/** GitHub's REST id, which its reply endpoint takes; review comments only. */
	databaseId?: number;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: string;
	url?: string;
	kind: "review" | "conversation";
	path?: string;
	line?: number;
	/** "LEFT" = deletions side, "RIGHT" = additions. Only set for review threads. */
	diffSide?: "LEFT" | "RIGHT";
	isResolved: boolean;
	isOutdated?: boolean;
	threadId?: string;
}
