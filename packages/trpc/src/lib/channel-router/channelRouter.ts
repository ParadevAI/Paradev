export interface RouterDev {
	id: string;
	name: string;
	description: string | null;
}

export interface RouterMessage {
	authorName: string;
	body: string;
}

export interface RouteInput {
	channelName: string;
	message: RouterMessage;
	recent: RouterMessage[];
	devs: RouterDev[];
}

export interface RouteDeps {
	fetch: typeof fetch;
	token: () => Promise<string>;
	timeoutMs?: number;
}

export interface RouteDecision {
	devIds: string[];
	scores: Record<string, number>;
}

export const JEV_URL = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
const JEV_MODEL = "typesafe-ai/jev";
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_RECENT = 10;
const MAX_BODY_CHARS = 2_000;
export const PRIMARY_THRESHOLD = 0.8;
export const SECONDARY_THRESHOLD = 0.7;
export const SEVERAL_THRESHOLD = 0.5;
const SEVERAL_QUESTION = "several";

function devQuestion(index: number): string {
	return `dev_${index}`;
}

function clip(message: RouterMessage) {
	return {
		author: message.authorName,
		text: message.body.slice(0, MAX_BODY_CHARS),
	};
}

function areaOf(dev: RouterDev): string {
	return dev.description?.trim()
		? `${dev.name}'s area: ${dev.description.trim()}.`
		: `${dev.name} has no area set.`;
}

export function buildJevRequest(input: RouteInput) {
	const devQuestions = Object.fromEntries(
		input.devs.map((dev, index) => [
			devQuestion(index),
			{
				type: "choice",
				instructions: `${dev.name} is an AI teammate in #${input.channelName}. ${areaOf(dev)} Should ${dev.name} reply to \`message\`?`,
				criteria: {
					respond: `\`message\` asks for a concrete task or a factual answer in ${dev.name}'s area, or reports a problem in that area for someone to fix, or follows up on something ${dev.name} said in \`recent_messages\``,
					stay_out: `People are talking to each other: an announcement, opinion, a question that asks people what they think, a request for humans to review or look at something, status update, thanks, joke, sarcasm or venting; or it is addressed to a named person, or mentions ${dev.name} only in passing, or the request belongs to another area`,
				},
			},
		]),
	);
	return {
		model: JEV_MODEL,
		state: {
			channel: `#${input.channelName}`,
			ai_teammates: input.devs.map((dev) => ({
				name: dev.name,
				area: dev.description,
			})),
			recent_messages: input.recent.slice(-MAX_RECENT).map(clip),
			message: clip(input.message),
		},
		questions: {
			...devQuestions,
			[SEVERAL_QUESTION]: {
				type: "noul",
				instructions:
					"Does `message` ask for two or more separate pieces of work that belong to different people or areas, or name two or more teammates to do something?",
			},
		},
	};
}

interface JevAnswer {
	type?: string;
	noul?: unknown;
	probabilities?: Record<string, unknown>;
}

function answersOf(response: unknown): Record<string, JevAnswer> {
	if (typeof response !== "object" || response === null) return {};
	const answers = (response as { answers?: unknown }).answers;
	if (typeof answers !== "object" || answers === null) return {};
	return answers as Record<string, JevAnswer>;
}

function probability(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function decide(response: unknown, devs: RouterDev[]): RouteDecision {
	const answers = answersOf(response);
	const scores: Record<string, number> = {};
	devs.forEach((dev, index) => {
		const answer = answers[devQuestion(index)];
		scores[dev.id] =
			answer?.type === "choice"
				? probability(answer.probabilities?.respond)
				: 0;
	});
	const ranked = devs
		.map((dev) => ({ id: dev.id, score: scores[dev.id] ?? 0 }))
		.sort((a, b) => b.score - a.score);
	const top = ranked[0];
	if (!top || top.score < PRIMARY_THRESHOLD) return { devIds: [], scores };
	const several = answers[SEVERAL_QUESTION];
	const allowsSeveral =
		several?.type === "noul" && probability(several.noul) >= SEVERAL_THRESHOLD;
	if (!allowsSeveral) return { devIds: [top.id], scores };
	const devIds = ranked
		.filter((entry) => entry.score >= SECONDARY_THRESHOLD)
		.map((entry) => entry.id);
	return { devIds, scores };
}

export async function routeChannelMessage(
	input: RouteInput,
	deps: RouteDeps,
): Promise<RouteDecision> {
	if (input.devs.length === 0 || !input.message.body.trim()) {
		return { devIds: [], scores: {} };
	}
	try {
		const response = await deps.fetch(JEV_URL, {
			method: "POST",
			headers: {
				authorization: `Bearer ${await deps.token()}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(buildJevRequest(input)),
			signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
		});
		if (!response.ok) return { devIds: [], scores: {} };
		return decide(await response.json(), input.devs);
	} catch {
		return { devIds: [], scores: {} };
	}
}
