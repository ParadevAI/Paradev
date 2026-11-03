import { createDismissalsStore } from "renderer/stores/createDismissalsStore";

/**
 * Holds at most one dismissed release per CLI: dismissing a newer one
 * replaces it, so a release after the dismissed one shows the notice again.
 */
export const useAgentCliUpdateDismissals = createDismissalsStore(
	"agent-cli-update-dismissals-v1",
	"AgentCliUpdateDismissals",
);

const dismissalId = (binary: string, version: string) => `${binary}@${version}`;

export function dismissAgentCliUpdate(binary: string, version: string): void {
	const store = useAgentCliUpdateDismissals.getState();
	for (const id of Object.keys(store.dismissedAt)) {
		if (id.startsWith(`${binary}@`)) store.reset(id);
	}
	store.dismiss(dismissalId(binary, version));
}

export function isAgentCliUpdateDismissed(
	dismissedAt: Record<string, number>,
	binary: string,
	version: string,
): boolean {
	return dismissalId(binary, version) in dismissedAt;
}
