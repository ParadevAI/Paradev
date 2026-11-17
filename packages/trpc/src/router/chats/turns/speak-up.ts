import type { TurnDeps } from "./engine";

const CLASSIFIER_URL = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
const CLASSIFIER_MODEL = "typesafe-ai/jev";
/** Quiet by default: only a confident "yes, and it's this Dev" makes one speak up. */
const THRESHOLD = 0.8;
const TIMEOUT_MS = 4_000;
const TEXT_MAX = 2_000;

type SpeakUp = NonNullable<TurnDeps["speakUp"]>;
type Input = Parameters<SpeakUp>[0];

const index = (at: number) => `dev_${at}`;

/** Two questions in one call: should an agent reply at all, and which one. */
export function speakUpRequest(input: Input) {
	return {
		model: CLASSIFIER_MODEL,
		state: {
			sender: input.sender,
			message: input.text.slice(0, TEXT_MAX),
			recent: input.recent.map((entry) => ({
				author: entry.author,
				text: entry.text.slice(0, TEXT_MAX),
			})),
			agents: input.devs.map((dev) => dev.name),
		},
		questions: {
			respond: {
				type: "choice",
				instructions:
					"This is a group chat with people and AI agents. Should one of the agents reply to the latest message, unasked?",
				criteria: {
					yes: "The message asks for help, information or action an agent can give",
					no: "People are talking among themselves",
				},
			},
			agent: {
				type: "choice",
				instructions: "Which agent should reply?",
				criteria: Object.fromEntries(
					input.devs.map((dev, at) => [
						index(at),
						`The agent named ${dev.name}`,
					]),
				),
			},
		},
	};
}

const number = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? value : 0;

/** The Dev to speak up, or null: both answers must be confident. */
export function speakUpDecision(
	response: unknown,
	input: Input,
): string | null {
	const answers = (response as { answers?: Record<string, unknown> } | null)
		?.answers as
		| Record<string, { probabilities?: Record<string, unknown> }>
		| undefined;
	if (number(answers?.respond?.probabilities?.yes) < THRESHOLD) return null;
	const picked = input.devs
		.map((dev, at) => ({
			id: dev.id,
			score: number(answers?.agent?.probabilities?.[index(at)]),
		}))
		.sort((a, b) => b.score - a.score)[0];
	return picked && picked.score >= THRESHOLD ? picked.id : null;
}

/** The speak-up check on the gateway's classifier. A failed call keeps the group quiet. */
export function gatewaySpeakUp(
	key: string,
	doFetch: typeof fetch = fetch,
): SpeakUp {
	return async (input) => {
		if (input.devs.length === 0 || !input.text.trim()) return null;
		const response = await doFetch(CLASSIFIER_URL, {
			method: "POST",
			headers: {
				authorization: `Bearer ${key}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(speakUpRequest(input)),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) return null;
		return speakUpDecision(await response.json(), input);
	};
}
