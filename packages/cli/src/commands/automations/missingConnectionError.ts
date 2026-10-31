import { CLIError } from "@superset/cli-framework";
import { TRIGGER_KIND_CONNECTOR } from "@superset/shared/automation-triggers";
import { getConnector } from "@superset/shared/connectors";
import type { ApiClient } from "../../lib/api-client";

export interface ConnectionState {
	connected: boolean;
	needsReauth: boolean;
}

export function missingConnectionError(
	triggers: { config: { kind: string } }[],
	status: Record<string, ConnectionState>,
): CLIError | null {
	const connectors = new Set(
		triggers.flatMap(({ config }) => {
			const connector = TRIGGER_KIND_CONNECTOR[config.kind];
			return connector ? [connector] : [];
		}),
	);
	const missing = [...connectors].filter(
		(connector) => !status[connector]?.connected,
	);
	if (missing.length === 0) return null;

	const name = (connector: string) =>
		getConnector(connector)?.displayName ?? connector;
	const steps = missing.map((connector) =>
		status[connector]?.needsReauth
			? `Your ${name(connector)} connection expired. Reconnect ${name(connector)} in Settings → Integrations.`
			: `Connect ${name(connector)} in Settings → Integrations.`,
	);
	return new CLIError(
		`These triggers would never fire: you have not connected ${missing.map(name).join(", ")}`,
		[...steps, "Then run this command again."].join(" "),
	);
}

export async function assertTriggersConnected(
	api: ApiClient,
	organizationId: string | undefined,
	triggers: { config: { kind: string } }[] | undefined,
): Promise<void> {
	if (!organizationId || !triggers?.length) return;
	const status = await api.integration.connectionStatus
		.query({ organizationId })
		.catch(() => null);
	if (!status) return;
	const error = missingConnectionError(triggers, status);
	if (error) throw error;
}
