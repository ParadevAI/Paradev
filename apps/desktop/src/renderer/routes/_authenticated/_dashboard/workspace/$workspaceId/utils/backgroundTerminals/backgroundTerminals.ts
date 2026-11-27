import type { Pane } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { paneClaimKeys } from "../agentPaneClaims";

export const BACKGROUND_TERMINAL_ATTACHMENT_DEBOUNCE_MS = 250;

export const BACKGROUND_TERMINAL_CLOSED_REFETCH_INTERVAL_MS = 10_000;
export const BACKGROUND_TERMINAL_OPEN_REFETCH_INTERVAL_MS = 2_000;

interface WorkspaceTabLike {
	panes: Record<string, Pick<Pane<PaneViewerData>, "kind" | "data">>;
}

interface BackgroundTerminalSessionLike {
	terminalId: string;
	createdAt?: number;
}

export function getAttachedTerminalIdsKey(
	tabs: readonly WorkspaceTabLike[],
): string {
	const ids = new Set<string>();
	for (const tab of tabs) {
		for (const pane of Object.values(tab.panes)) {
			const { terminalId } = paneClaimKeys(pane);
			if (terminalId) ids.add(terminalId);
		}
	}
	return JSON.stringify([...ids].sort());
}

export function parseAttachedTerminalIdsKey(key: string): string[] {
	try {
		const parsed = JSON.parse(key);
		return Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		return [];
	}
}

/**
 * Terminals that have a tab now or had one in the settled snapshot. A new tab
 * counts at once; a tab that goes away still counts until the snapshot settles.
 */
export function getTabbedTerminalIds(
	currentKey: string,
	settledKey: string,
): string[] {
	return [
		...new Set([
			...parseAttachedTerminalIdsKey(currentKey),
			...parseAttachedTerminalIdsKey(settledKey),
		]),
	];
}

export function getBackgroundTerminalSessions<
	T extends BackgroundTerminalSessionLike,
>(sessions: readonly T[], attachedTerminalIds: Iterable<string>): T[] {
	const attached = new Set(attachedTerminalIds);
	return sessions
		.filter((session) => !attached.has(session.terminalId))
		.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function getBackgroundTerminalRefetchInterval(isOpen: boolean): number {
	return isOpen
		? BACKGROUND_TERMINAL_OPEN_REFETCH_INTERVAL_MS
		: BACKGROUND_TERMINAL_CLOSED_REFETCH_INTERVAL_MS;
}
