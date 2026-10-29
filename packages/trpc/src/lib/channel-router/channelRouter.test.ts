import { describe, expect, test } from "bun:test";
import {
	buildJevRequest,
	decide,
	JEV_URL,
	type RouteInput,
	type RouterDev,
	routeChannelMessage,
} from "./channelRouter";

const ada: RouterDev = { id: "ada-id", name: "Ada", description: "Backend" };
const milo: RouterDev = { id: "milo-id", name: "Milo", description: null };

const input: RouteInput = {
	channelName: "eng",
	message: { authorName: "Sam", body: "can someone fix the API?" },
	recent: [],
	devs: [ada, milo],
};

function jevResponse(input: {
	respond: number[];
	several?: number;
}): Record<string, unknown> {
	const answers: Record<string, unknown> = {
		several: { type: "noul", noul: input.several ?? 0 },
	};
	input.respond.forEach((respond, index) => {
		answers[`dev_${index}`] = {
			type: "choice",
			probabilities: { respond, stay_out: 1 - respond },
		};
	});
	return { answers };
}

describe("buildJevRequest", () => {
	test("asks one respond/stay_out question per Dev plus the several gate", () => {
		const request = buildJevRequest(input);
		expect(Object.keys(request.questions)).toEqual([
			"dev_0",
			"dev_1",
			"several",
		]);
		expect(request.questions.dev_0).toMatchObject({
			type: "choice",
			criteria: {
				respond: expect.any(String),
				stay_out: expect.any(String),
			},
		});
		expect(request.questions.several).toMatchObject({ type: "noul" });
		expect(String(request.questions.dev_1?.instructions)).toContain(
			"Milo has no area set.",
		);
		expect(request.state.message).toEqual({
			author: "Sam",
			text: "can someone fix the API?",
		});
	});

	test("keeps only the last ten recent messages and clips long bodies", () => {
		const recent = Array.from({ length: 15 }, (_, index) => ({
			authorName: "Sam",
			body: `message ${index}`,
		}));
		const request = buildJevRequest({
			...input,
			recent,
			message: { authorName: "Sam", body: "x".repeat(5_000) },
		});
		expect(request.state.recent_messages).toHaveLength(10);
		expect(request.state.recent_messages[0]?.text).toBe("message 5");
		expect(request.state.message.text).toHaveLength(2_000);
	});
});

describe("decide", () => {
	test("routes to nobody when no Dev reaches the primary threshold", () => {
		expect(decide(jevResponse({ respond: [0.79, 0.4] }), input.devs)).toEqual({
			devIds: [],
			scores: { "ada-id": 0.79, "milo-id": 0.4 },
		});
	});

	test("routes to the top Dev when it reaches the threshold", () => {
		expect(
			decide(jevResponse({ respond: [0.2, 0.9] }), input.devs).devIds,
		).toEqual(["milo-id"]);
	});

	test("keeps only the top Dev when the message does not ask for several tasks", () => {
		expect(
			decide(jevResponse({ respond: [0.95, 0.9], several: 0.2 }), input.devs)
				.devIds,
		).toEqual(["ada-id"]);
	});

	test("adds a second Dev above the secondary threshold when the message asks for several tasks", () => {
		expect(
			decide(jevResponse({ respond: [0.75, 0.95], several: 0.9 }), input.devs)
				.devIds,
		).toEqual(["milo-id", "ada-id"]);
		expect(
			decide(jevResponse({ respond: [0.65, 0.95], several: 0.9 }), input.devs)
				.devIds,
		).toEqual(["milo-id"]);
	});

	test("treats a malformed response as nobody", () => {
		for (const response of [
			null,
			"oops",
			{},
			{ answers: { dev_0: { type: "noul", noul: 1 } } },
			{
				answers: { dev_0: { type: "choice", probabilities: { respond: "1" } } },
			},
		]) {
			expect(decide(response, input.devs).devIds).toEqual([]);
		}
	});
});

describe("routeChannelMessage", () => {
	test("posts the request with the bearer token and returns the decision", async () => {
		const calls: { url: string; init?: RequestInit }[] = [];
		const fakeFetch = (async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			return Response.json(jevResponse({ respond: [0.9, 0.1] }));
		}) as typeof fetch;
		const decision = await routeChannelMessage(input, {
			fetch: fakeFetch,
			token: async () => "test-token",
		});
		expect(decision.devIds).toEqual(["ada-id"]);
		expect(calls[0]?.url).toBe(JEV_URL);
		expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(
			"Bearer test-token",
		);
		expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(
			buildJevRequest(input),
		);
	});

	test("fails closed on HTTP errors, thrown errors, token errors and timeouts", async () => {
		const token = async () => "test-token";
		const failures: Parameters<typeof routeChannelMessage>[1][] = [
			{
				fetch: (async () =>
					new Response("bad", { status: 500 })) as unknown as typeof fetch,
				token,
			},
			{
				fetch: (async () => {
					throw new Error("network");
				}) as unknown as typeof fetch,
				token,
			},
			{
				fetch: (async () =>
					Response.json(jevResponse({ respond: [1, 1] }))) as typeof fetch,
				token: async () => {
					throw new Error("no token");
				},
			},
			{
				fetch: ((_url: string, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () =>
							reject(init.signal?.reason),
						);
					})) as typeof fetch,
				token,
				timeoutMs: 5,
			},
		];
		for (const deps of failures) {
			expect(await routeChannelMessage(input, deps)).toEqual({
				devIds: [],
				scores: {},
			});
		}
	});

	test("skips the call when there are no Devs or the message is empty", async () => {
		let called = false;
		const fakeFetch = (async () => {
			called = true;
			return Response.json({});
		}) as unknown as typeof fetch;
		const deps = { fetch: fakeFetch, token: async () => "test-token" };
		await routeChannelMessage({ ...input, devs: [] }, deps);
		await routeChannelMessage(
			{ ...input, message: { authorName: "Sam", body: "  " } },
			deps,
		);
		expect(called).toBe(false);
	});
});
