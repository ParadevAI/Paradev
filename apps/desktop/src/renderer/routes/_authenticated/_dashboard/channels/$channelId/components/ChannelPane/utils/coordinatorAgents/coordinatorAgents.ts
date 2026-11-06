/** The chat agents a coordinator can run as, by preset id. */
export const COORDINATOR_AGENTS: ReadonlyArray<{ id: string; label: string }> =
	[
		{ id: "claude", label: "Claude" },
		{ id: "codex", label: "Codex" },
		{ id: "opencode", label: "OpenCode" },
	];

export function coordinatorAgentLabel(presetId: string): string {
	return (
		COORDINATOR_AGENTS.find((agent) => agent.id === presetId)?.label ?? presetId
	);
}
