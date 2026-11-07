import { canBindPort } from "../host-service-utils";
import { portManager } from "../terminal/port-manager";
import { ForwardReporter } from "./forward-reporter";
import { PortForwardManager } from "./port-forward-manager";
import { RelayForwardTransport } from "./relay-forward-transport";

export { PortForwardManager } from "./port-forward-manager";
export { RelayForwardTransport } from "./relay-forward-transport";
export type { ForwardTransport } from "./types";

let relayToken: string | null = null;
const hostTokens = new Map<string, string>();
// Gate hosts never get the relay token, even when their ticket is missing.
const gateHosts = new Set<string>();

export function setRelayToken(token: string | null): void {
	relayToken = token;
}

export function setHostToken(hostUrl: string, token: string | null): void {
	gateHosts.add(hostUrl);
	if (token) hostTokens.set(hostUrl, token);
	else hostTokens.delete(hostUrl);
}

export const portForwardManager = new PortForwardManager({
	transport: new RelayForwardTransport({
		getToken: (target) =>
			gateHosts.has(target.hostUrl)
				? (hostTokens.get(target.hostUrl) ?? null)
				: relayToken,
	}),
	getLocalPorts: () => portManager.getAllPorts(),
	killLocalPort: ({ terminalId, workspaceId, port }) =>
		portManager.killPort({ terminalId, workspaceId, port }),
	canBindPort,
});

export const forwardReporter = new ForwardReporter({
	getToken: () => relayToken,
});
portForwardManager.on("change", (forwards) => forwardReporter.sync(forwards));

// Explicit forwards belong to no window, so nothing else ends them at sign-out.
export function endForwardingSession(): void {
	forwardReporter.stopAll();
	void portForwardManager.stopExplicit();
	hostTokens.clear();
	gateHosts.clear();
}
