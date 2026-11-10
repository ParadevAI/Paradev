import { SANDBOX_API_CREDENTIAL_HEADER } from "@superset/shared/sandbox-gate";
import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";

export function createApiClient(token: string, apiUrl: string) {
	return createClient({ Authorization: `Bearer ${token}` }, apiUrl);
}

export function createSandboxApiClient(credential: string, apiUrl: string) {
	return createClient({ [SANDBOX_API_CREDENTIAL_HEADER]: credential }, apiUrl);
}

function createClient(headers: Record<string, string>, apiUrl: string) {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${apiUrl}/api/trpc`,
				transformer: SuperJSON,
				headers: () => headers,
			}),
		],
	});
}
