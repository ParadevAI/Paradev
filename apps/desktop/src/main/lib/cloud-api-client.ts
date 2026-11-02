import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import { app } from "electron";
import { env } from "main/env.main";
import SuperJSON from "superjson";

export function createCloudApiClient(
	token: string,
	organizationId?: string | null,
): TRPCClient<AppRouter> {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
				transformer: SuperJSON,
				headers: () => ({
					Authorization: `Bearer ${token}`,
					...(organizationId ? { [ORGANIZATION_HEADER]: organizationId } : {}),
					"x-superset-client": `desktop/${app.getVersion()}`,
				}),
			}),
		],
	});
}
