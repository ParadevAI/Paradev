import { CLIError } from "@superset/cli-framework";
import { TRIGGER_KIND_CONNECTOR } from "@superset/shared/automation-triggers";
import { getConnector } from "@superset/shared/connectors";
import type { ApiClient } from "../../lib/api-client";

export interface ConnectionState {
	connected: boolean;
	needsReauth: boolean;
	accounts?: { id: string; needsReauth: boolean }[];
}

type Problem = "missing" | "expired" | "foreignPin";

interface TriggerInput {
	config: { kind: string };
	connectionId?: string | null;
}

function problemFor(
	trigger: TriggerInput,
	state: ConnectionState | undefined,
): Problem | null {
	if (trigger.connectionId) {
		const account = state?.accounts?.find(
			(candidate) => candidate.id === trigger.connectionId,
		);
		if (!account) return "foreignPin";
		return account.needsReauth ? "expired" : null;
	}
	if (state?.connected) return null;
	return state?.needsReauth ? "expired" : "missing";
}

export function missingConnectionError(
	triggers: TriggerInput[],
	status: Record<string, ConnectionState>,
): CLIError | null {
	const problems = new Map<string, Problem>();
	for (const trigger of triggers) {
		const connector = TRIGGER_KIND_CONNECTOR[trigger.config.kind];
		if (!connector || problems.has(connector)) continue;
		const problem = problemFor(trigger, status[connector]);
		if (problem) problems.set(connector, problem);
	}
	if (problems.size === 0) return null;

	const name = (connector: string) =>
		getConnector(connector)?.displayName ?? connector;
	const reasons: string[] = [];
	const steps: string[] = [];
	for (const [connector, problem] of problems) {
		const n = name(connector);
		if (problem === "expired") {
			reasons.push(`your ${n} connection expired`);
			steps.push(`Reconnect ${n} in Settings → Integrations.`);
		} else if (problem === "foreignPin") {
			reasons.push(
				`a ${n} trigger is pinned to an account you have not connected`,
			);
			steps.push(
				`Drop its connectionId, or set it to one of your ${n} accounts.`,
			);
		} else {
			reasons.push(`you have not connected ${n}`);
			steps.push(`Connect ${n} in Settings → Integrations.`);
		}
	}
	return new CLIError(
		`These triggers would never fire: ${reasons.join("; ")}`,
		[...steps, "Then run this command again."].join(" "),
	);
}

export async function assertTriggersConnected(
	api: ApiClient,
	organizationId: string | undefined,
	triggers: TriggerInput[] | undefined,
): Promise<void> {
	if (!organizationId || !triggers?.length) return;
	const status = await api.integration.connectionStatus
		.query({ organizationId })
		.catch(() => null);
	if (!status) return;
	const error = missingConnectionError(triggers, status);
	if (error) throw error;
}
