export const KEPT_WORKSPACE_LIMIT = 8;
export const STARTUP_PREWARM_LIMIT = 4;
// Bounded by KEPT_WORKSPACE_LIMIT ids; overwritten on every visit.
export const RECENT_WORKSPACES_KEY = "v2-recent-workspaces";
const PREWARM_SPACING_MS = 250;

const ACTIVE_CLASS = "absolute inset-0 z-[1] flex min-h-0 min-w-0";
// Opacity and z-index do not inherit, so a swap restyles only the wrappers.
const HIDDEN_CLASS = "absolute inset-0 z-0 flex min-h-0 min-w-0 opacity-0";

export interface KeptWorkspace {
	id: string;
	usedAt: number;
	/** False until the user opens it. */
	shown: boolean;
}

interface KeptWorkspacesStoreOptions {
	storage: Pick<Storage, "getItem" | "setItem"> | null;
	scheduleIdle: (run: () => void) => void;
	now: () => number;
}

export function keptWorkspaceClassName(isActive: boolean): string {
	return isActive ? ACTIVE_CLASS : HIDDEN_CLASS;
}

export function createKeptWorkspacesStore({
	storage,
	scheduleIdle,
	now,
}: KeptWorkspacesStoreOptions) {
	let kept: KeptWorkspace[] = [];
	let activeId: string | null = null;
	const listeners = new Set<() => void>();
	const elements = new Map<string, HTMLElement>();
	let unseenRecent: string[] | null = null;
	const prewarmQueue: string[] = [];
	let prewarmRunning = false;

	function publish(next: KeptWorkspace[]) {
		kept = next;
		for (const listener of listeners) listener();
	}

	function readRecent(): string[] {
		try {
			const parsed: unknown = JSON.parse(
				storage?.getItem(RECENT_WORKSPACES_KEY) ?? "[]",
			);
			return Array.isArray(parsed)
				? parsed.filter((id): id is string => typeof id === "string")
				: [];
		} catch {
			return [];
		}
	}

	function saveRecent(visitedId: string) {
		if (!storage) return;
		const recent = [
			visitedId,
			...readRecent().filter((id) => id !== visitedId),
		].slice(0, KEPT_WORKSPACE_LIMIT);
		try {
			storage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(recent));
		} catch {}
	}

	// New entries go last and the rest keep their order: moving a kept tree
	// in the DOM reloads its webviews.
	function visit(workspaceId: string) {
		activeId = workspaceId;
		const existing = kept.find((entry) => entry.id === workspaceId);
		const entry = { id: workspaceId, usedAt: now(), shown: true };
		let next = existing
			? kept.map((candidate) => (candidate === existing ? entry : candidate))
			: [...kept, entry];
		if (next.length > KEPT_WORKSPACE_LIMIT) {
			const oldest = next.reduce((a, b) => (b.usedAt < a.usedAt ? b : a));
			next = next.filter((candidate) => candidate !== oldest);
		}
		publish(next);
		saveRecent(workspaceId);
	}

	// Never evicts an opened workspace: when full, it replaces the oldest
	// workspace that was only prewarmed.
	function prewarm(workspaceId: string) {
		if (kept.some((entry) => entry.id === workspaceId)) return;
		let next = kept;
		if (next.length >= KEPT_WORKSPACE_LIMIT) {
			const unopened = next.find((entry) => !entry.shown);
			if (!unopened) return;
			next = next.filter((entry) => entry !== unopened);
		}
		publish([...next, { id: workspaceId, usedAt: 0, shown: false }]);
	}

	function forget(workspaceId: string) {
		if (!kept.some((entry) => entry.id === workspaceId)) return;
		publish(kept.filter((entry) => entry.id !== workspaceId));
	}

	/** Ids `exists` rejects wait for a later call. */
	function prewarmRecent(exists: (workspaceId: string) => boolean) {
		unseenRecent ??= readRecent().slice(0, STARTUP_PREWARM_LIMIT);
		prewarmQueue.push(...unseenRecent.filter(exists));
		unseenRecent = unseenRecent.filter((id) => !exists(id));
		if (prewarmRunning || prewarmQueue.length === 0) return;
		prewarmRunning = true;
		const next = () => {
			const id = prewarmQueue.shift();
			if (!id) {
				prewarmRunning = false;
				return;
			}
			prewarm(id);
			scheduleIdle(next);
		};
		scheduleIdle(next);
	}

	function register(workspaceId: string, element: HTMLElement | null) {
		if (element) elements.set(workspaceId, element);
		else elements.delete(workspaceId);
	}

	// React commits the same classes later, and sets `inert` then: toggling
	// it restyles the whole subtree.
	function showNow(workspaceId: string): boolean {
		if (!elements.has(workspaceId)) return false;
		for (const [id, element] of elements) {
			element.className = keptWorkspaceClassName(id === workspaceId);
		}
		return true;
	}

	return {
		get: () => kept,
		/** Undoes a `showNow` that no navigation followed. */
		showActive: () => activeId !== null && showNow(activeId),
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		visit,
		prewarm,
		forget,
		prewarmRecent,
		register,
		showNow,
	};
}

export const keptWorkspacesStore = createKeptWorkspacesStore({
	storage: typeof localStorage === "undefined" ? null : localStorage,
	scheduleIdle: (run) =>
		setTimeout(
			() => requestIdleCallback(run, { timeout: 2_000 }),
			PREWARM_SPACING_MS,
		),
	now: Date.now,
});
