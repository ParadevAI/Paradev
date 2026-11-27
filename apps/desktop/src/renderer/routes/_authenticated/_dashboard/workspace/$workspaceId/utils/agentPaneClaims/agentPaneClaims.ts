import type { Pane } from "@superset/panes";
import {
	type ChatPaneData,
	type PaneViewerData,
	PENDING_CLOUD_LAUNCH_PANE_KIND,
} from "../../types";

export interface AgentPaneClaims {
	terminalIds: Set<string>;
	sessionIds: Set<string>;
}

type PaneLike = Pick<Pane<PaneViewerData>, "kind" | "data">;

interface LayoutLike {
	tabs: readonly { panes: Record<string, PaneLike> }[];
}

export interface AgentClaimKeys {
	terminalIds?: readonly (string | null | undefined)[];
	sessionIds?: readonly (string | null | undefined)[];
}

const AGENT_PANE_KINDS = new Set<string>([
	"chat-v3",
	"terminal",
	PENDING_CLOUD_LAUNCH_PANE_KIND,
]);

export function isAgentPane(pane: PaneLike): boolean {
	return AGENT_PANE_KINDS.has(pane.kind);
}

export function paneClaimKeys(pane: PaneLike): {
	terminalId: string | null;
	sessionId: string | null;
} {
	if (!isAgentPane(pane)) return { terminalId: null, sessionId: null };
	const data = pane.data as Partial<ChatPaneData>;
	return {
		terminalId:
			typeof data.terminalId === "string" && data.terminalId
				? data.terminalId
				: null,
		sessionId:
			pane.kind === "chat-v3" && typeof data.sessionId === "string"
				? data.sessionId
				: null,
	};
}

export function emptyAgentPaneClaims(): AgentPaneClaims {
	return { terminalIds: new Set(), sessionIds: new Set() };
}

export function claimAgentPane(claims: AgentPaneClaims, pane: PaneLike): void {
	const { terminalId, sessionId } = paneClaimKeys(pane);
	if (terminalId) claims.terminalIds.add(terminalId);
	if (sessionId) claims.sessionIds.add(sessionId);
}

export function claimKeys(claims: AgentPaneClaims, keys: AgentClaimKeys): void {
	for (const id of keys.terminalIds ?? []) if (id) claims.terminalIds.add(id);
	for (const id of keys.sessionIds ?? []) if (id) claims.sessionIds.add(id);
}

export function agentPaneClaims(
	layouts: readonly (LayoutLike | null | undefined)[],
): AgentPaneClaims {
	const claims = emptyAgentPaneClaims();
	for (const layout of layouts) {
		for (const tab of layout?.tabs ?? []) {
			for (const pane of Object.values(tab.panes)) claimAgentPane(claims, pane);
		}
	}
	return claims;
}

export function isClaimed(
	claims: AgentPaneClaims,
	keys: AgentClaimKeys,
): boolean {
	return (
		(keys.terminalIds ?? []).some((id) => !!id && claims.terminalIds.has(id)) ||
		(keys.sessionIds ?? []).some((id) => !!id && claims.sessionIds.has(id))
	);
}
