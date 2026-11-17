import {
	type Api,
	type ClassifierContext,
	type ClassifierResult,
	isContextOverflow,
	type Message,
	type Model,
} from "@earendil-works/pi-ai";
import type {
	ModelRoute,
	ModelRouteRequest,
	VirtualModelDefinition,
} from "@earendil-works/pi-coding-agent";

const TIERS = ["fast", "medium", "strong"] as const;
export type Tier = (typeof TIERS)[number];

/** Gateway model ids per tier: the first answers, the rest are fallbacks in order when it fails. */
export type RouterTiers = Record<Tier, string[]>;

/** `DEV_MODEL` value that routes each turn between the tiers instead of pinning one model. */
export const AUTO = "auto";

const DEFAULT_TIERS: RouterTiers = {
	fast: ["anthropic/claude-haiku-5.5"],
	medium: ["anthropic/claude-sonnet-5.5"],
	strong: ["anthropic/claude-opus-5.5"],
};

const TIER_ENV: Record<Tier, string> = {
	fast: "DEV_MODELS_FAST",
	medium: "DEV_MODELS_MEDIUM",
	strong: "DEV_MODELS_STRONG",
};

/** The tiers from `DEV_MODELS_<TIER>` (comma-separated gateway ids), each unset or empty one at its default. */
export function routerTiersFromEnv(
	env: Record<string, string | undefined>,
): RouterTiers {
	const tier = (name: Tier) => {
		const ids = (env[TIER_ENV[name]] ?? "")
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean);
		return ids.length > 0 ? ids : DEFAULT_TIERS[name];
	};
	return { fast: tier("fast"), medium: tier("medium"), strong: tier("strong") };
}

/** Ids no tier may use because the catalog doesn't know them; checked at startup so a typo never fails a turn. */
export function unknownModels(
	tiers: RouterTiers,
	known: (id: string) => boolean,
): string[] {
	return [...new Set(TIERS.flatMap((tier) => tiers[tier]))].filter(
		(id) => !known(id),
	);
}

/** A chat's tier, kept on its pi session so the next turn knows what the last one used. */
interface RouterState {
	tier: Tier;
}

/** Leaving the tier the chat is on costs its prompt cache, so Jev must be this sure of another one. */
const SWITCH_CONFIDENCE = 0.7;
/** Jev runs before the turn's first token; past this the turn goes on without it. */
const CLASSIFY_TIMEOUT_MS = 3_000;
/** Jev reads the turn's input up to here. */
const INPUT_MAX = 16_000;
/** A new chat whose first turn Jev couldn't rate. */
const FALLBACK_TIER: Tier = "medium";
/**
 * Every turn's level: pi gives a virtual model no thinking unless it says so. Without thinking, models write their
 * answer as final text rather than calling `reply` (about half of new groups' hellos, every turn of a session that
 * started that way), and nobody sees it. Set on each route too, as a session keeps the level it was recorded with.
 */
const THINKING = "medium";

const QUESTION = {
	type: "choice",
	instructions:
		"An AI agent in a messenger got `input` (a chat message, a task or a question). How much work does answering it take?",
	criteria: {
		fast: "A quick reply: chatting, a short answer, a lookup, updating or listing tasks",
		medium:
			"Normal work: a few steps, reading and writing files, a short document, a small change to an app",
		strong:
			"Heavy work: building or redesigning an app, a long document or plan, hard reasoning, many steps",
	},
} as const;

interface RouterOptions {
	tiers: RouterTiers;
	/** The gateway model with this id (the chat models the tiers name). */
	model(id: string): Model<Api> | undefined;
	/** Jev; null when it isn't available (the runner then keeps each chat on its tier). */
	classify:
		| ((
				context: ClassifierContext,
				signal: AbortSignal,
		  ) => Promise<ClassifierResult>)
		| null;
	log?: (line: string) => void;
}

function lastUserText(messages: readonly Message[]): string {
	const content = messages.findLast((m) => m.role === "user")?.content ?? "";
	if (typeof content === "string") return content;
	return content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join("\n");
}

/**
 * `dev/auto`: a pi virtual model that picks a physical model for every request. A turn's first request asks Jev how
 * much work the turn is and uses that tier's first model; the turn's later requests stay on the model that answered, so
 * its prompt cache holds. A failed request moves to the tier's next model. Compaction summaries and other requests
 * outside a turn go to the fast tier.
 */
export function routerModel(
	opts: RouterOptions,
): VirtualModelDefinition<RouterState> {
	const log = opts.log ?? (() => {});
	const resolve = (id: string) => {
		const model = opts.model(id);
		if (!model) throw new Error(`Unknown gateway model ${id}`);
		return model;
	};
	const first = (tier: Tier) => resolve(opts.tiers[tier][0]!);
	const all = TIERS.flatMap((tier) => opts.tiers[tier]).map(resolve);
	const route = (
		model: Model<Api>,
		state?: RouterState,
	): ModelRoute<RouterState> => ({ model, thinkingLevel: THINKING, state });

	async function rate(
		request: ModelRouteRequest<RouterState>,
	): Promise<{ tier: Tier; confidence: number } | null> {
		if (!opts.classify) return null;
		const signal = AbortSignal.any([
			AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
			...(request.signal ? [request.signal] : []),
		]);
		try {
			const result = await opts.classify(
				{
					state: { input: lastUserText(request.messages).slice(0, INPUT_MAX) },
					questions: { work: QUESTION },
				},
				signal,
			);
			const answer =
				result.stopReason === "stop" ? result.answers.work : undefined;
			if (
				answer?.type !== "choice" ||
				!(TIERS as readonly string[]).includes(answer.choice)
			)
				return null;
			return {
				tier: answer.choice as Tier,
				confidence: answer.probabilities[answer.choice] ?? 0,
			};
		} catch (err) {
			log(`Jev failed (${err instanceof Error ? err.message : String(err)})`);
			return null;
		}
	}

	return {
		provider: "dev",
		id: AUTO,
		name: "Auto",
		thinkingLevels: [THINKING],
		// Limits of the smallest model, so a session compacts and rolls over in time for any of them.
		contextWindow: Math.min(...all.map((m) => m.contextWindow)),
		maxTokens: Math.min(...all.map((m) => m.maxTokens)),
		async route(request) {
			const current = request.state;
			if (request.reason === "direct")
				return { model: first("fast"), thinkingLevel: request.thinkingLevel };
			if (request.reason === "continuation" && request.previous)
				return route(request.previous.model);
			if (request.reason === "retry" && request.failed) {
				const failed = request.failed.model;
				// An overflow is compacted and retried on the same model; any other failure moves down the tier's list.
				if (isContextOverflow(request.failed.message, failed.contextWindow))
					return route(failed);
				const list = current ? opts.tiers[current.tier] : [];
				const at = list.indexOf(failed.id);
				const next = at >= 0 ? list[at + 1] : undefined;
				if (next) {
					log(
						`${failed.id} failed (${request.failed.message.errorMessage ?? "error"}), falling back to ${next}`,
					);
					return route(resolve(next));
				}
				return route(failed);
			}
			// Only a turn's first request is rated; anything else without a model to stay on goes to the chat's tier.
			if (request.reason !== "user")
				return route(first(current?.tier ?? FALLBACK_TIER));

			const rating = await rate(request);
			let tier = current?.tier ?? rating?.tier ?? FALLBACK_TIER;
			if (
				current &&
				rating &&
				rating.tier !== current.tier &&
				rating.confidence >= SWITCH_CONFIDENCE
			)
				tier = rating.tier;
			log(
				`turn routed to ${tier} (Jev: ${rating ? `${rating.tier} ${rating.confidence.toFixed(2)}` : "no answer"}${current ? `, was ${current.tier}` : ""})`,
			);
			return route(first(tier), tier === current?.tier ? current : { tier });
		},
	};
}
