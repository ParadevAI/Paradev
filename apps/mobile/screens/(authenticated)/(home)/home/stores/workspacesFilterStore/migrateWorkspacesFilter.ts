import type { SavedWorkspaceScope } from "./workspacesFilterStore";

export const WORKSPACES_FILTER_VERSION = 2;

interface PersistedWorkspacesFilter {
	hostFilter?: string | null;
	scope?: SavedWorkspaceScope | "host";
	sort?: string;
	[key: string]: unknown;
}

/**
 * Version 0 stored "updatedAt" as its sort default, so it cannot tell a choice
 * from the default; it maps to desktop's default instead. Versions 0 and 1
 * always saved `scope: "host"`, so only a saved machine counts as a choice.
 */
export function migrateWorkspacesFilter(
	persisted: unknown,
	version: number,
): PersistedWorkspacesFilter {
	const state = { ...(persisted as PersistedWorkspacesFilter) };
	if (version < 1) {
		state.sort = state.sort === "createdAt" ? "created" : "manual";
	}
	if (version < 2 && state.scope === "host" && !state.hostFilter) {
		state.scope = null;
	}
	return state;
}
