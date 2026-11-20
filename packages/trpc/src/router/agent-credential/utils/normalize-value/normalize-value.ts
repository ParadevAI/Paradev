import type { AgentCredentialKind } from "@superset/db/schema";

export function normalizeAgentCredentialValue(input: {
	agent: string;
	kind: AgentCredentialKind;
	value: string;
}): string {
	return input.agent === "claude" && input.kind === "subscription"
		? input.value.replace(/\s/g, "")
		: input.value.trim();
}
