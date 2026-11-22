import { readFileSync } from "node:fs";
import { JSONFilePreset } from "lowdb/node";
import { APP_STATE_PATH } from "../app-environment";
import { pruneTabsState } from "./prune-tabs-state";
import { pruneV1AgentSessions } from "./prune-v1-agent-sessions";
import type { AppState } from "./schemas";
import { defaultAppState } from "./schemas";

type AppStateDB = Awaited<ReturnType<typeof JSONFilePreset<AppState>>>;

let _appState: AppStateDB | null = null;

/**
 * Ensures loaded data has the correct shape by merging with defaults.
 * Handles legacy app-state.json files that may have a different structure
 * (e.g., from old electron-store format with keys like "tabs-storage").
 */
export function ensureValidShape(
	data: Partial<AppState>,
	liveWorkspaceIds: ReadonlySet<string> | null = null,
): AppState {
	const withLiveTabs = (state: AppState["tabsState"]) =>
		liveWorkspaceIds ? pruneTabsState(state, liveWorkspaceIds) : state;
	const tabsState = withLiveTabs({
		...defaultAppState.tabsState,
		...(data.tabsState ?? {}),
	});
	const tabsStateByWindow = Object.fromEntries(
		Object.entries(data.tabsStateByWindow ?? {}).map(([key, state]) => [
			key,
			withLiveTabs({ ...defaultAppState.tabsState, ...(state ?? {}) }),
		]),
	);
	// Keyed by pane id; dropping entries of gone panes bounds the record.
	const v1AgentSessions = pruneV1AgentSessions(data.v1AgentSessions ?? {}, [
		tabsState,
		...Object.values(tabsStateByWindow),
	]);
	return {
		tabsState,
		tabsStateByWindow,
		v1AgentSessions,
		themeState: {
			...defaultAppState.themeState,
			...(data.themeState ?? {}),
		},
		hotkeysState: {
			...defaultAppState.hotkeysState,
			...(data.hotkeysState ?? {}),
			byPlatform: {
				...defaultAppState.hotkeysState.byPlatform,
				...(data.hotkeysState?.byPlatform ?? {}),
			},
		},
		lastRunVersion: data.lastRunVersion,
	};
}

/**
 * Re-read only themeState from disk into the in-memory app state. Used when
 * an external writer (the CLI) updates app-state.json while the app runs:
 * without this, the next lowdb flush would clobber the external change.
 * Deliberately does not reload other fields — they are owned by in-memory
 * state and may have unflushed updates.
 */
export function reloadThemeStateFromDisk(): AppState["themeState"] | null {
	if (!_appState) return null;
	try {
		const raw = readFileSync(APP_STATE_PATH, "utf-8");
		const parsed = JSON.parse(raw) as Partial<AppState> | null;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return null;
		}
		const themeState = {
			...defaultAppState.themeState,
			...(parsed.themeState ?? {}),
		};
		_appState.data.themeState = themeState;
		return themeState;
	} catch (error) {
		console.error("[app-state] Failed to reload themeState from disk:", error);
		return null;
	}
}

/**
 * `listLiveWorkspaceIds` scopes the persisted v1 tab layout to workspaces that
 * still exist; a deleted workspace never removed its tabs, so the file grew
 * without bound. When it throws, nothing is pruned.
 */
export async function initAppState(
	listLiveWorkspaceIds?: () => Iterable<string>,
): Promise<void> {
	if (_appState) return;

	_appState = await JSONFilePreset<AppState>(APP_STATE_PATH, defaultAppState);

	let liveWorkspaceIds: ReadonlySet<string> | null = null;
	try {
		if (listLiveWorkspaceIds)
			liveWorkspaceIds = new Set(listLiveWorkspaceIds());
	} catch (error) {
		console.error(
			"[app-state] Skipping tabs prune, workspaces unreadable:",
			error,
		);
	}
	const sizeBefore = JSON.stringify(_appState.data).length;
	_appState.data = ensureValidShape(_appState.data, liveWorkspaceIds);
	const sizeAfter = JSON.stringify(_appState.data).length;
	if (sizeAfter < sizeBefore) {
		try {
			await _appState.write();
			console.log(
				`[app-state] Pruned stale tabs: ${sizeBefore} -> ${sizeAfter} bytes`,
			);
		} catch (error) {
			console.error("[app-state] Failed to write pruned tabs:", error);
		}
	}

	console.log(`App state initialized at: ${APP_STATE_PATH}`);
}

export function isAppStateInitialized(): boolean {
	return _appState !== null;
}

export const appState = new Proxy({} as AppStateDB, {
	get(_target, prop) {
		if (!_appState) {
			throw new Error("App state not initialized. Call initAppState() first.");
		}
		const value = _appState[prop as keyof AppStateDB];
		// Bind methods to the real instance to preserve correct `this` context
		if (typeof value === "function") {
			return value.bind(_appState);
		}
		return value;
	},
});

/**
 * Drop per-window state for windows that will not be restored.
 *
 * Called from the same place that writes the restorable window set, so the two
 * cannot drift: a window whose key is no longer persisted is gone for good, and
 * keeping its layout would grow app-state.json on every new window forever.
 */
export function pruneWindowScopedState(liveKeys: string[]): void {
	const byWindow = appState.data.tabsStateByWindow;
	if (!byWindow) return;
	const live = new Set(liveKeys);
	const kept = Object.fromEntries(
		Object.entries(byWindow).filter(([key]) => live.has(key)),
	);
	if (Object.keys(kept).length === Object.keys(byWindow).length) return;
	appState.data.tabsStateByWindow = kept;
}
