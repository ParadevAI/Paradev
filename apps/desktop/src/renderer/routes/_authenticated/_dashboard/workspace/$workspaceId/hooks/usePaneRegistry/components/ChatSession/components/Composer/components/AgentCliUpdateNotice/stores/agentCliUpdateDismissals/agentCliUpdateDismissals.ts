import { createDismissalsStore } from "renderer/stores/createDismissalsStore";

/** `update` offers a newer release; `restart` offers the one already installed. */
export type AgentCliUpdateDismissalKind = "update" | "restart";

/**
 * Holds at most one dismissed version per CLI and kind: dismissing a newer one
 * replaces it, so a release after the dismissed one shows the notice again.
 * The kinds are apart so that dismissing one card does not bring back the other.
 */
export const useAgentCliUpdateDismissals = createDismissalsStore(
	"agent-cli-update-dismissals-v1",
	"AgentCliUpdateDismissals",
);

const idPrefix = (binary: string, kind: AgentCliUpdateDismissalKind) =>
	kind === "update" ? `${binary}@` : `${binary}:${kind}@`;

export function dismissAgentCliUpdate(
	binary: string,
	version: string,
	kind: AgentCliUpdateDismissalKind = "update",
): void {
	const store = useAgentCliUpdateDismissals.getState();
	const prefix = idPrefix(binary, kind);
	for (const id of Object.keys(store.dismissedAt)) {
		if (id.startsWith(prefix)) store.reset(id);
	}
	store.dismiss(prefix + version);
}

export function isAgentCliUpdateDismissed(
	dismissedAt: Record<string, number>,
	binary: string,
	version: string,
	kind: AgentCliUpdateDismissalKind = "update",
): boolean {
	return idPrefix(binary, kind) + version in dismissedAt;
}
