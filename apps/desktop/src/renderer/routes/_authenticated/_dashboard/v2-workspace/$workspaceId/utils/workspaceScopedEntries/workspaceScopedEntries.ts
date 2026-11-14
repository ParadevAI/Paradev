export interface WorkspaceScopedEntries<T> {
	workspaceId: string | null;
	entries: Record<string, T>;
}

export function emptyWorkspaceScopedEntries<T>(): WorkspaceScopedEntries<T> {
	return { workspaceId: null, entries: {} };
}

/** Sets one entry; a write for another workspace drops the old workspace's entries. */
export function setWorkspaceScopedEntry<T>(
	prev: WorkspaceScopedEntries<T>,
	workspaceId: string,
	key: string,
	value: T,
): WorkspaceScopedEntries<T> {
	if (prev.workspaceId !== workspaceId) {
		return { workspaceId, entries: { [key]: value } };
	}
	if (prev.entries[key] === value) return prev;
	return { workspaceId, entries: { ...prev.entries, [key]: value } };
}

const NO_ENTRIES: Record<string, never> = {};

export function entriesForWorkspace<T>(
	state: WorkspaceScopedEntries<T>,
	workspaceId: string,
): Record<string, T> {
	return state.workspaceId === workspaceId ? state.entries : NO_ENTRIES;
}
