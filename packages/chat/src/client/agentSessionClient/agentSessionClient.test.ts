import { describe, expect, test } from "bun:test";
import { createAgentSessionClient } from "./agentSessionClient";

function setup() {
	const requests: string[] = [];
	const prompts: unknown[] = [];
	let grants = 0;
	const client = createAgentSessionClient({
		sessionId: "s1",
		title: "Harness",
		api: {
			access: async () => {
				grants += 1;
				return {
					baseUrl: "https://rt/v2/agent-runtime",
					ticket: `t${grants}`,
					expiresInSeconds: 900,
				};
			},
			prompt: async (input) => prompts.push(input),
			interrupt: async () => {},
		},
		fetch: (async (url: string) => {
			requests.push(url);
			if (url.includes("/head")) {
				return Response.json({
					cursor: { epoch: "e1", seq: 9 },
					session: {
						status: "running",
						harness: "agent-harness",
						queueControls: false,
					},
					updatedAt: 5,
				});
			}
			return Response.json({
				envelopes: [],
				nextBefore: { epoch: "e1", seq: 3 },
			});
		}) as unknown as typeof fetch,
	});
	return { client, requests, prompts, grants: () => grants };
}

describe("agent session client", () => {
	test("loads the session head and pages history backwards with one ticket", async () => {
		const { client, requests, grants } = setup();
		const session = await client.getSession();
		expect(session.cursor).toEqual({ epoch: "e1", seq: 9 });
		expect(session.session).toMatchObject({
			status: "running",
			title: "Harness",
			harness: "agent-harness",
		});
		const page = await client.getItems({
			before: { epoch: "e1", seq: 9 },
			limit: 50,
		});
		expect(page).toEqual({
			ok: true,
			envelopes: [],
			nextBefore: { epoch: "e1", seq: 3 },
		});
		expect(requests[1]).toBe(
			"https://rt/v2/agent-runtime/sessions/s1/events?before=e1%3A9&limit=50",
		);
		expect(grants()).toBe(1);
	});

	test("sends text prompts with the client id as the prompt id, and refuses attachments", async () => {
		const { client, prompts } = setup();
		const result = await client.prompt({
			clientId: "c1",
			content: [{ type: "text", text: "hi" }],
		});
		expect(prompts).toEqual([{ sessionId: "s1", promptId: "c1", text: "hi" }]);
		expect(result).toEqual({ itemId: "user-c1", queued: false });
		await expect(
			client.prompt({
				clientId: "c2",
				content: [{ type: "attachment" } as never],
			}),
		).rejects.toThrow("text only");
	});
});
