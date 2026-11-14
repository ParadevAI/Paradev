import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import * as Application from "expo-application";
import superjson from "superjson";
import { getJwt } from "../auth/client";
import { sessionFetch, sessionHeaders } from "../auth/sessionTransport";
import { env } from "../env";
import { transportRetryLink } from "../errors";

const clientVersionHeader = `mobile/${Application.nativeApplicationVersion ?? "0.0.0"}`;

export const apiClient = createTRPCProxyClient<AppRouter>({
	links: [
		transportRetryLink(),
		httpBatchLink({
			url: `${env.EXPO_PUBLIC_API_URL}/api/trpc`,
			fetch: sessionFetch,
			headers() {
				const jwt = getJwt();
				return {
					"x-superset-client": clientVersionHeader,
					...sessionHeaders(),
					...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
				};
			},
			transformer: superjson,
		}),
	],
});
