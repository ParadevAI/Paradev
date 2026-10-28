import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";

/** USD per million tokens, the shape pi computes `usage.cost` from. */
export interface ModelPrice {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

const FREE: ModelPrice = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const CONFIG_TTL_MS = 10 * 60_000;
const CONFIG_TIMEOUT_MS = 5_000;

interface RouterConfig {
	models?: Array<{ id: string; price?: ModelPrice }>;
}

/**
 * Prices from the router's `/v1/config`, as pdev reads them, so a turn's cost
 * matches what the router bills. pi's own Anthropic catalog covers a router
 * that does not answer, such as a local run against Anthropic directly.
 */
export function createModelPrices(options: {
	fetch?: typeof fetch;
	now?: () => number;
}) {
	const fetcher = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const configs = new Map<
		string,
		{ at: number; value: Promise<RouterConfig | null> }
	>();

	const config = (baseUrl: string, headers: Record<string, string>) => {
		const cached = configs.get(baseUrl);
		if (cached && now() - cached.at < CONFIG_TTL_MS) return cached.value;
		const value = fetcher(`${baseUrl.replace(/\/+$/, "")}/v1/config`, {
			headers,
			signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
		})
			.then((response) =>
				response.ok ? (response.json() as Promise<RouterConfig>) : null,
			)
			.catch(() => null);
		configs.set(baseUrl, { at: now(), value });
		return value;
	};

	return async function priceOf(model: {
		baseUrl: string;
		modelId: string;
		headers: Record<string, string>;
	}): Promise<ModelPrice> {
		const routed = (await config(model.baseUrl, model.headers))?.models?.find(
			(entry) => entry.id === model.modelId,
		)?.price;
		if (routed) return routed;
		const known = (ANTHROPIC_MODELS as Record<string, { cost?: ModelPrice }>)[
			model.modelId
		]?.cost;
		return known ?? FREE;
	};
}
