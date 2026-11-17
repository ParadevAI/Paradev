import type { Tab } from "@superset/panes";
import { normalizeTerminalTitle } from "@superset/shared/terminal-title-scanner";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";

/** A tab split across several terminals names none of them. */
export function soleTerminalId(tab: Tab<PaneViewerData>): string | null {
	const terminalIds = new Set<string>();
	for (const pane of Object.values(tab.panes)) {
		if (pane.kind !== "terminal") continue;
		const { terminalId } = pane.data as Partial<TerminalPaneData>;
		if (terminalId) terminalIds.add(terminalId);
	}
	if (terminalIds.size !== 1) return null;
	const [terminalId] = terminalIds;
	return terminalId ?? null;
}

interface SessionName {
	terminalId: string;
	customTitle: string | null;
}

/** A name another session already has is not given twice. */
export function tabNamesToBackfill(
	tabs: readonly Tab<PaneViewerData>[],
	sessions: readonly SessionName[],
	skip: ReadonlySet<string>,
): { terminalId: string; title: string }[] {
	const unnamed = new Set(
		sessions
			.filter((session) => session.customTitle === null)
			.map((session) => session.terminalId),
	);
	const taken = new Set(
		sessions.flatMap((session) =>
			session.customTitle ? [session.customTitle] : [],
		),
	);
	return tabs.flatMap((tab) => {
		const title = normalizeTerminalTitle(tab.titleOverride ?? "");
		const terminalId = soleTerminalId(tab);
		if (!title || !terminalId) return [];
		if (!unnamed.has(terminalId) || skip.has(terminalId)) return [];
		if (taken.has(title)) return [];
		taken.add(title);
		return [{ terminalId, title }];
	});
}

/** Clearing a tab name clears the session name only when the tab gave it. */
export function shouldClearSessionName(
	previousTabTitle: string | undefined,
	sessionCustomTitle: string | null | undefined,
): boolean {
	const previous = normalizeTerminalTitle(previousTabTitle ?? "");
	return !!previous && sessionCustomTitle === previous;
}
