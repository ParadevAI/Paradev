export interface AgentRow {
	/** Terminal id — selected as `?tab=` on the workspace route. */
	id: string;
	/** Workspace the terminal belongs to; the deep link's real target. */
	workspaceId: string;
	name: string;
	project: string;
	/** Filename returned by `cacheIcon`, or omitted to draw the initial. */
	iconFile?: string;
	/** Pre-translated status word, e.g. "Needs you". */
	status: string;
	state: "permission" | "working" | "failed" | "review";
	/**
	 * Time in the current state, already formatted — "12m", "1h", "3d".
	 * Formatted here rather than natively: SwiftUI's free-ticking timer can
	 * only render mm:ss, and units belong in Lingui's catalogs.
	 */
	elapsed: string;
	isQuiet?: boolean;
}

export interface AgentSnapshot {
	rows: AgentRow[];
	more?: string;
	/** Every agent, not just the rows that fit on the card. */
	totalCount: number;
	topState: AgentRow["state"];
	staleDetail?: string;
	machineName: string;
	staleAfterSeconds?: number;
}

/** A glanceable, system-drawn card of agent status outside the app. */
export interface LiveActivityModule {
	areActivitiesEnabled: () => boolean;
	activeIds: () => string[];
	/** Downloads, downscales and caches a project icon where the card can read it. */
	cacheIcon: (key: string, url: string) => Promise<string>;
	start: (snapshot: AgentSnapshot) => Promise<string>;
	update: (id: string, snapshot: AgentSnapshot) => Promise<void>;
	endAll: () => Promise<void>;
}
