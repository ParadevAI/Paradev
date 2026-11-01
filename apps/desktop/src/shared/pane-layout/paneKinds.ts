import type { DiffPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export const PENDING_CLOUD_CHAT_PANE_KIND = "pending-cloud-chat";

/** Kinds that live in the main area; every other kind opens in the right pane. */
export const CENTER_PANE_KINDS: ReadonlySet<string> = new Set([
	"terminal",
	"chat-v3",
	PENDING_CLOUD_CHAT_PANE_KIND,
]);

export const DEFAULT_BROWSER_URL = "about:blank";

export const NEW_DIFF_PANE = {
	kind: "diff",
	data: { path: "", collapsedFiles: [] } as DiffPaneData,
} as const;
