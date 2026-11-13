/**
 * Preset id — not a config id — to the harness that runs it as a chat. The two
 * are different spaces: a config id is a per-user UUID, and every lookup here
 * takes the preset the config was built from.
 *
 * Mirrors the harnesses the host registers. An agent listed here that the host
 * cannot run is worse than an omission: its terminal is replaced by a chat
 * whose session never starts.
 */
const ACP_HARNESS_BY_PRESET: Record<string, string> = {
	claude: "claude-acp",
	codex: "codex-acp",
	opencode: "opencode-acp",
	pi: "pi-acp",
	pdev: "pdev-acp",
};

export type AcpStartMode = { id: string; label: string };

const ACP_START_MODES: Record<
	string,
	{ modes: readonly AcpStartMode[]; defaultModeId: string }
> = {
	"claude-acp": {
		modes: [
			{ id: "default", label: "Ask for approval" },
			{ id: "acceptEdits", label: "Approve edits" },
			{ id: "auto", label: "Approve for me" },
			{ id: "plan", label: "Plan" },
			{ id: "bypassPermissions", label: "Full access" },
		],
		defaultModeId: "bypassPermissions",
	},
	"codex-acp": {
		modes: [
			{ id: "read-only", label: "Read-only" },
			{ id: "workspace-write", label: "Workspace access" },
			{ id: "agent", label: "Auto review" },
			{ id: "agent-full-access", label: "Full access" },
		],
		defaultModeId: "agent-full-access",
	},
	"pdev-acp": {
		modes: [
			{ id: "default", label: "Ask for approval" },
			{ id: "auto", label: "Approve for me" },
			{ id: "bypassPermissions", label: "Full access" },
		],
		defaultModeId: "bypassPermissions",
	},
};

export function acpStartModes(
	presetId: string | null | undefined,
): { modes: readonly AcpStartMode[]; defaultModeId: string } | undefined {
	const harness = acpHarnessForPreset(presetId);
	return harness ? ACP_START_MODES[harness] : undefined;
}

/** Harness ids from before ACP, still on old sessions. Display only. */
const LEGACY_PRESET_BY_HARNESS: Record<string, string> = {
	"claude-code": "claude",
	codex: "codex",
};

export function acpHarnessForPreset(
	presetId: string | null | undefined,
): string | undefined {
	return presetId ? ACP_HARNESS_BY_PRESET[presetId] : undefined;
}

export function presetForAcpHarness(harness: string): string | undefined {
	return Object.entries(ACP_HARNESS_BY_PRESET).find(
		([, candidate]) => candidate === harness,
	)?.[0];
}

/**
 * The agent to show for any chat, including one on a pre-ACP harness. Not for
 * deciding what to open as a chat: an old harness cannot be driven like one.
 */
export function presetForAnyHarness(harness: string): string | undefined {
	return presetForAcpHarness(harness) ?? LEGACY_PRESET_BY_HARNESS[harness];
}

/**
 * Decision note: Stop asks first while a background subagent runs on these harnesses.
 *
 * claude-agent-acp 0.85.0 answers `session/cancel` by interrupting the whole Claude
 * session and finishing every native subagent as cancelled. ACP has no request that
 * stops only the main turn. Since a prompt sent during a background wait starts a
 * new turn instead of queueing, Stop on that turn is a common path, and it silently
 * killed the subagent (seen in the desktop app on 2026-11-13). Remove a harness from
 * this list once its agent can cancel a turn without its background subagents.
 */
const CANCEL_STOPS_BACKGROUND_SUBAGENTS: ReadonlySet<string> = new Set([
	"claude-acp",
]);

export function cancelStopsBackgroundSubagents(
	harness: string | null | undefined,
): boolean {
	return harness ? CANCEL_STOPS_BACKGROUND_SUBAGENTS.has(harness) : false;
}
