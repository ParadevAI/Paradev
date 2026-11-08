import { realtimeWorkspaceForwardsPath } from "@superset/shared/realtime";
import { env } from "main/env.main";
import { canBindPort } from "../host-service-utils";
import { portManager } from "../terminal/port-manager";
import { ForwardReporter } from "./forward-reporter";
import { ForwardTokens } from "./forward-tokens";
import { PortForwardManager } from "./port-forward-manager";
import { RelayForwardTransport } from "./relay-forward-transport";

export { PortForwardManager } from "./port-forward-manager";
export { RelayForwardTransport } from "./relay-forward-transport";
export type { ForwardTransport } from "./types";

const tokens = new ForwardTokens();

export function setRelayToken(token: string | null): void {
	tokens.setRelayToken(token);
}

export function setHostToken(hostUrl: string, token: string | null): void {
	tokens.setHostToken(hostUrl, token);
}

/** A cloud forward names its host as a gate host itself, in case the ticket hand-off failed. */
export function markGateHost(hostUrl: string): void {
	tokens.markGateHost(hostUrl);
}

const transport = new RelayForwardTransport({
	resolveLocalhostSubdomains: env.NODE_ENV === "development",
	getToken: (target) => tokens.tokenFor(target.hostUrl),
});

export const portForwardManager = new PortForwardManager({
	transport,
	getLocalPorts: () => portManager.getAllPorts(),
	killLocalPort: ({ terminalId, workspaceId, port }) =>
		portManager.killPort({ terminalId, workspaceId, port }),
	canBindPort,
});

export const forwardReporter = new ForwardReporter({
	getToken: () => tokens.getRelayToken(),
});
portForwardManager.on("change", (forwards) => forwardReporter.sync(forwards));

// Explicit forwards belong to no window, so nothing else ends them at sign-out.
export function endForwardingSession(): void {
	tokens.clearCredentials();
	forwardReporter.stopAll();
	void portForwardManager.stopExplicit();
	transport.closeAll();
}

/** Built here, not taken from the renderer: this address receives the user's token. */
export function setForwardReportOrganization(
	workspaceId: string,
	organizationId: string,
): void {
	forwardReporter.setReportUrl(
		workspaceId,
		new URL(
			realtimeWorkspaceForwardsPath(organizationId, workspaceId),
			env.REALTIME_URL,
		).toString(),
	);
}
