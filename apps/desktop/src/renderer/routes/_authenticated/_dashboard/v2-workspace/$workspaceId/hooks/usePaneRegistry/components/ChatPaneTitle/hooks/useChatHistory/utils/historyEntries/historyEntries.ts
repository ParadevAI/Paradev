import type { ChatTransport } from "@superset/chat/client";
import { presetForAcpHarness } from "@superset/chat/core";
import type { DiscoveredSession } from "@superset/chat/protocol";

type SavedSession = Awaited<ReturnType<ChatTransport["listSessions"]>>[number];

export interface HistoryEntry {
	key: string;
	presetId: string;
	harnessSessionId?: string;
	sessionId: string | null;
	terminalId?: string;
	title?: string;
	updatedAt: number;
}

export function historyEntries(
	saved: SavedSession[],
	native: DiscoveredSession[],
	harness: string,
): HistoryEntry[] {
	const presetId = presetForAcpHarness(harness);
	if (!presetId) return [];
	const entries = new Map<string, HistoryEntry>();
	for (const session of native) {
		entries.set(session.sessionId, {
			key: session.sessionId,
			presetId,
			harnessSessionId: session.sessionId,
			sessionId: null,
			title: session.title,
			updatedAt: Date.parse(session.updatedAt ?? "") || 0,
		});
	}
	const ordered = saved
		.filter((session) => session.harness === harness)
		.sort(
			(a, b) => Number(b.live) - Number(a.live) || b.updatedAt - a.updatedAt,
		);
	const seen = new Set<string>();
	for (const session of ordered) {
		const key = session.harnessSessionId ?? session.sessionId;
		if (seen.has(key)) continue;
		seen.add(key);
		const discovered = entries.get(key);
		entries.set(key, {
			key,
			presetId,
			harnessSessionId: session.harnessSessionId ?? undefined,
			sessionId: session.sessionId,
			terminalId: session.terminalId ?? undefined,
			title: session.title ?? discovered?.title,
			updatedAt: Math.max(session.updatedAt, discovered?.updatedAt ?? 0),
		});
	}
	return [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
