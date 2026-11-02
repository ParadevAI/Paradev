import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import { app } from "electron";
import { env } from "main/env.main";
import SuperJSON from "superjson";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_CHARS = 300;

/**
 * Aborts a request at the deadline, so a stalled one cannot hold the plugin
 * queue, and names the status of a non-JSON error page (a gateway's HTML 502)
 * that tRPC would otherwise report only as a parse failure.
 */
export async function fetchWithDeadline(
	input: string | URL | Request,
	init: RequestInit = {},
	timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
	const deadline = AbortSignal.timeout(timeoutMs);
	const response = await fetch(input, {
		...init,
		signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
	});
	const contentType = response.headers.get("content-type") ?? "";
	if (response.ok || contentType.includes("json")) return response;
	const body = (await response.text())
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.join(" / ")
		.slice(0, MAX_ERROR_BODY_CHARS);
	throw new Error(
		`HTTP ${response.status} ${response.statusText}: ${body}`.trimEnd(),
	);
}

type LinkFetch = NonNullable<Parameters<typeof httpBatchLink>[0]["fetch"]>;

export function createCloudApiClient(
	token: string,
	organizationId?: string | null,
): TRPCClient<AppRouter> {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
				transformer: SuperJSON,
				fetch: fetchWithDeadline as LinkFetch,
				headers: () => ({
					Authorization: `Bearer ${token}`,
					...(organizationId ? { [ORGANIZATION_HEADER]: organizationId } : {}),
					"x-superset-client": `desktop/${app.getVersion()}`,
				}),
			}),
		],
	});
}
