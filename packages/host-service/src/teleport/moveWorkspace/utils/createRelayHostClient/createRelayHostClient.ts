import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import SuperJSON from "superjson";
import type { ApiAuthProvider } from "../../../../providers/auth/types";
import type { AppRouter } from "../../../../trpc/router";

export type RelayHostClient = TRPCClient<AppRouter>;

/** Another of the person's computers, reached through the relay as them. */
export function createRelayHostClient({
	relayUrl,
	organizationId,
	hostId,
	auth,
}: {
	relayUrl: string;
	organizationId: string;
	hostId: string;
	auth: ApiAuthProvider;
}): RelayHostClient {
	const routingKey = buildHostRoutingKey(organizationId, hostId);
	return createTRPCClient<AppRouter>({
		links: [
			httpLink({
				url: `${relayUrl}/hosts/${routingKey}/trpc`,
				transformer: SuperJSON,
				headers: () => auth.getHeaders(),
			}),
		],
	});
}
