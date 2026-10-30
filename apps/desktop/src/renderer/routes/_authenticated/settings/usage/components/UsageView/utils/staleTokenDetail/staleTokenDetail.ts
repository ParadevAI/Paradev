import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { QuotaAgent } from "../visibleQuotaAgents";

/** A lapsed access token renews when the CLI that owns it runs again. */
export function staleTokenDetail(agent: QuotaAgent): string {
	if (agent === "codex") {
		return i18n._(msg({ message: "Refreshes when Codex next runs." }));
	}
	if (agent === "opencode") {
		return i18n._(msg({ message: "Refreshes when OpenCode next runs." }));
	}
	return i18n._(msg({ message: "Refreshes when Claude Code next runs." }));
}
