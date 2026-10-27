import type { Model } from "@earendil-works/pi-ai";

/** A Claude 5 model served by router.superset.sh, which speaks the Anthropic Messages API. */
export function routerModel(
	baseUrl: string,
	modelId: string,
): Model<"anthropic-messages"> {
	return {
		id: modelId,
		name: modelId,
		api: "anthropic-messages",
		provider: "superset-router",
		baseUrl,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		reasoning: true,
		contextWindow: 200_000,
		maxTokens: 32_000,
		thinkingLevelMap: {
			off: null,
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max",
		},
		compat: {
			forceAdaptiveThinking: true,
			supportsTemperature: false,
			supportsStrictTools: true,
		},
	};
}
