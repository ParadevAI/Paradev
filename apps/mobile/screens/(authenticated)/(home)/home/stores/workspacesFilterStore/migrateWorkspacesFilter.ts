import type { ScopeSelection } from "@/screens/(authenticated)/(home)/utils/scopeSelection";

export const WORKSPACES_FILTER_VERSION = 3;

interface PersistedWorkspacesFilter {
	hostFilter?: string | null;
	scope?: "host" | "cloud" | "all" | null;
	selection?: ScopeSelection | null;
	sort?: string;
	[key: string]: unknown;
}

/**
 * Version 0 stored "updatedAt" as its sort default, so it cannot tell a choice
 * from the default; it maps to desktop's default instead. Versions 0–2 saved
 * one scope: a machine becomes that machine, Cloud becomes Cloud alone, and
 * "all" or no saved machine becomes no choice, which Home's default fills.
 */
export function migrateWorkspacesFilter(
	persisted: unknown,
	version: number,
): PersistedWorkspacesFilter {
	const state = { ...(persisted as PersistedWorkspacesFilter) };
	if (version < 1) {
		state.sort = state.sort === "createdAt" ? "created" : "manual";
	}
	if (version < 3) {
		const { scope, hostFilter } = state;
		state.selection =
			scope === "cloud"
				? { hosts: [], cloud: true }
				: scope === "host" && hostFilter
					? { hosts: [hostFilter], cloud: false }
					: null;
		delete state.scope;
		delete state.hostFilter;
	}
	return state;
}
