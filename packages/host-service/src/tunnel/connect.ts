import { getHostId, getHostName } from "@superset/shared/host-info";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { JwtApiAuthProvider } from "../providers/auth/JwtAuthProvider/JwtAuthProvider";
import type { ApiClient } from "../types";
import { TunnelClient } from "./tunnel-client";
import { TunnelClientV2 } from "./tunnel-client-v2";

export interface ConnectRelayOptions {
	api: ApiClient;
	relayUrl: string;
	localPort: number;
	organizationId: string;
	authProvider: JwtApiAuthProvider;
	hostServiceSecret: string;
}

// The relay advertises its protocol on /health ({proto: 2} for tunnel v2);
// anything else — including the v1 relay's {ok, region} and any probe
// failure — selects the v1 client. Negotiating here keeps protocol choice
// between host and relay instead of adding config plumbing through every
// spawner (desktop, CLI, env).
async function detectRelayProto(relayUrl: string): Promise<1 | 2> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(new URL("/health", relayUrl), {
				signal: AbortSignal.timeout(5_000),
			});
			if (!res.ok) return 1;
			const data = (await res.json()) as { proto?: number };
			return data.proto === 2 ? 2 : 1;
		} catch {
			await new Promise((r) => setTimeout(r, 1_000 * (attempt + 1)));
		}
	}
	return 1;
}

export async function connectRelay(
	options: ConnectRelayOptions,
): Promise<TunnelClient | TunnelClientV2 | null> {
	try {
		const host = await options.api.host.ensure.mutate({
			organizationId: options.organizationId,
			machineId: getHostId(),
			name: getHostName(),
		});
		console.log(`[host-service] registered as host ${host.machineId}`);

		const clientOptions = {
			relayUrl: options.relayUrl,
			hostId: buildHostRoutingKey(options.organizationId, host.machineId),
			getAuthToken: () => options.authProvider.getJwt(),
			localPort: options.localPort,
			hostServiceSecret: options.hostServiceSecret,
		};

		const proto = await detectRelayProto(options.relayUrl);
		console.log(`[host-service] relay protocol: v${proto}`);
		const tunnel =
			proto === 2
				? new TunnelClientV2(clientOptions)
				: new TunnelClient(clientOptions);
		void tunnel.connect();
		return tunnel;
	} catch (error) {
		console.error("[host-service] failed to register/connect relay:", error);
		return null;
	}
}
