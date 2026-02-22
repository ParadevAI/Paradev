import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

type MaybePromise<T> = T | Promise<T>;

export type GetHeaders = () => MaybePromise<Record<string, string>>;

export function createApiTrpcClient(options: {
	apiUrl: string;
	getHeaders: GetHeaders;
}) {
	return createTRPCProxyClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${options.apiUrl}/api/trpc`,
				transformer: superjson,
				headers: async () => (await options.getHeaders()) ?? {},
			}),
		],
	});
}
