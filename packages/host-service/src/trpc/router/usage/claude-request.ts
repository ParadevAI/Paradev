import { quotaRetryDelay, setQuotaResponseRetry } from "./quota-backoff";
import {
	type createQuotaCooldownStore,
	hashQuotaScope,
	type QuotaEndpoint,
	quotaCooldownStore,
} from "./quota-cooldown-store";

type Store = ReturnType<typeof createQuotaCooldownStore>;
type Diagnostic = {
	endpoint: QuotaEndpoint;
	scope: string;
	status: number;
	retryAt: number;
	at: number;
	cached: boolean;
};

export function createClaudeRequestClient({
	store = quotaCooldownStore,
	now = () => Date.now(),
	random = Math.random,
	fetcher = (...args: Parameters<typeof fetch>) => fetch(...args),
}: {
	store?: Store;
	now?: () => number;
	random?: () => number;
	fetcher?: (
		input: string | URL | Request,
		init?: RequestInit,
	) => Promise<Response>;
} = {}) {
	const diagnostics: Diagnostic[] = [];
	function note(value: Diagnostic) {
		diagnostics.push(value);
		if (diagnostics.length > 96) diagnostics.shift();
	}
	return {
		diagnostics: () => diagnostics.map((value) => ({ ...value })),
		async request(
			endpoint: QuotaEndpoint,
			accessToken: string,
			url: string,
			init: RequestInit,
			canonicalProfile?: string | null,
		): Promise<Response> {
			const keys = [hashQuotaScope(["claude-http-v1", endpoint, accessToken])];
			if (canonicalProfile)
				keys.push(
					hashQuotaScope([
						"claude-profile-pause-v1",
						endpoint,
						canonicalProfile,
					]),
				);
			const pause = keys
				.map((key) => store.get(key))
				.filter((entry) => entry !== undefined)
				.sort((a, b) => b.retryAt - a.retryAt)[0];
			const scope = keys[0] as string;
			if (pause && pause.retryAt > now()) {
				note({
					endpoint,
					scope,
					status: pause.status,
					retryAt: pause.retryAt,
					at: now(),
					cached: true,
				});
				return setQuotaResponseRetry(
					new Response(null, {
						status: pause.status,
						headers: {
							"Retry-After": String(Math.ceil((pause.retryAt - now()) / 1000)),
						},
					}),
					pause.retryAt,
				);
			}
			if (init.signal?.aborted) throw new Error("Usage request cancelled.");
			let response: Response;
			try {
				response = await fetcher(url, init);
			} catch (error) {
				if (init.signal?.aborted) throw error;
				response = new Response(null, { status: 503 });
			}
			if ([408, 429, 500, 502, 503, 504, 529].includes(response.status)) {
				const failures = Math.min((pause?.failures ?? 0) + 1, 8);
				const base = response.status === 429 ? 5 * 60_000 : 30_000;
				const exponential = Math.min(30 * 60_000, base * 2 ** (failures - 1));
				const delay = Math.max(
					quotaRetryDelay(response.headers.get("retry-after"), now()),
					Math.min(
						30 * 60_000,
						exponential +
							(failures > 1
								? Math.floor(
										exponential * 0.2 * Math.max(0, Math.min(1, random())),
									)
								: 0),
					),
				);
				const retryAt = now() + delay;
				for (const key of keys)
					store.set({
						key,
						kind: response.status === 429 ? "rate_limit" : "transient",
						status: response.status,
						failures,
						retryAt,
						updatedAt: now(),
					});
				setQuotaResponseRetry(response, retryAt);
				note({
					endpoint,
					scope,
					status: response.status,
					retryAt,
					at: now(),
					cached: false,
				});
			} else {
				for (const key of keys) store.clear(key);
				note({
					endpoint,
					scope,
					status: response.status,
					retryAt: 0,
					at: now(),
					cached: false,
				});
			}
			return response;
		},
	};
}

export const claudeRequests = createClaudeRequestClient();
