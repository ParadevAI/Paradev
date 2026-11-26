import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import { env } from "../../env";
import { posthog } from "../../lib/analytics";

let jevResponse: Response;
let captured: Array<{ event: string; properties?: Record<string, unknown> }> =
	[];

const selectChain = {
	from: () => selectChain,
	where: () => selectChain,
	limit: () => Promise.resolve([]),
};

stub(db, { select: () => selectChain });
stub(env, { VERCEL_AI_GATEWAY_KEY: "test-gateway-key" });
stub(globalThis, { fetch: () => Promise.resolve(jevResponse.clone()) });
stub(posthog, {
	capture: (message: {
		event: string;
		properties?: Record<string, unknown>;
	}) => {
		captured.push(message);
	},
});

const { jevChannelRouter } = await import("./channel-routing");

const input = {
	channel: { id: "channel-1", name: "general" },
	message: {
		id: "message-1",
		body: "can someone fix the build?",
		authorName: "Ada",
	},
	devs: [
		{ id: "dev-a", name: "Builder", description: "CI" },
		{ id: "dev-b", name: "Planner", description: null },
	],
};

describe("jevChannelRouter", () => {
	beforeEach(() => {
		captured = [];
	});

	test("records each Dev's score with the Devs it picked", async () => {
		jevResponse = Response.json({
			answers: {
				dev_0: { type: "choice", probabilities: { respond: 0.9 } },
				dev_1: { type: "choice", probabilities: { respond: 0.2 } },
			},
		});

		expect(await jevChannelRouter(input)).toEqual(["dev-a"]);
		expect(captured).toEqual([
			expect.objectContaining({
				event: "dev_channel_routed",
				properties: {
					channelId: "channel-1",
					messageId: "message-1",
					answered: true,
					picked: ["dev-a"],
					scores: { "dev-a": 0.9, "dev-b": 0.2 },
				},
			}),
		]);
	});

	test("records a Jev failure apart from a decision to stay out", async () => {
		jevResponse = new Response("bad request", { status: 400 });

		expect(await jevChannelRouter(input)).toBeNull();
		expect(captured[0]?.properties).toMatchObject({
			answered: false,
			picked: [],
			scores: {},
		});
	});
});
