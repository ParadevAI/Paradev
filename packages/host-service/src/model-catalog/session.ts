import { presetForAcpHarness } from "@superset/chat/core";
import type { ChatRuntime } from "@superset/chat-runtime";
import type { AgentModelCatalog } from "@superset/shared/agent-models";
import { enrichModels } from "./metadata";

type Session = Pick<
	NonNullable<ReturnType<ChatRuntime["live"]["get"]>>,
	"scopeId" | "harness" | "state"
>;
export function sessionModelCatalog(
	session: Session | null,
	workspaceId: string | undefined,
): AgentModelCatalog | undefined {
	if (
		!session ||
		session.state.status === "dead" ||
		session.scopeId !== workspaceId
	)
		return undefined;
	const models = session.state.configOptions?.find(
		(option) => option.category === "model",
	)?.options;
	return {
		models: enrichModels(
			models ?? [],
			presetForAcpHarness(session.harness) ?? session.harness,
		),
		availability: models ? "reported" : "unknown",
	};
}
