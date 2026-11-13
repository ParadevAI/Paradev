import { acpStartModes } from "@superset/chat/core";

/**
 * The mode a chat launch keeps when it falls back to a terminal. Terminal
 * presets have no permission modes, and the claude and codex presets skip
 * approvals, so only the full-access chat default can drop. A narrower mode
 * throws instead of running with more access than was chosen.
 */
export function terminalFallbackMode(
	agent: string,
	mode: string | undefined,
): undefined {
	if (!mode || mode === acpStartModes(agent)?.defaultModeId) return undefined;
	throw new Error(
		`${agent} chat mode "${mode}" has no terminal equivalent, and the chat harness is not live`,
	);
}
