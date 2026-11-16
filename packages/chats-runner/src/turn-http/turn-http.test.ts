import { afterAll, describe, expect, test } from "bun:test";
import { settleOverHttp } from "./turn-http.ts";

// A stand-in for the API's settle endpoint that fails the first `failures` calls with a 503.
let failures = 0;
const calls: {
	path: string;
	chat: string | null;
	auth: string | null;
	body: unknown;
}[] = [];
const api = Bun.serve({
	port: 0,
	async fetch(req) {
		calls.push({
			path: new URL(req.url).pathname,
			chat: req.headers.get("x-dev-chat"),
			auth: req.headers.get("authorization"),
			body: await req.json(),
		});
		if (failures > 0) {
			failures--;
			return new Response("restarting", { status: 503 });
		}
		return new URL(req.url).pathname.includes("gone")
			? new Response("forbidden", { status: 403 })
			: new Response(null, { status: 204 });
	},
});
afterAll(() => api.stop());

const sleeps: number[] = [];
const settle = settleOverHttp(
	`${api.url.origin}/`,
	async (ms) => void sleeps.push(ms),
);

describe("settle callbacks", () => {
	test("post the settlement naming the turn's chat, with no credential (the box's proxy adds it)", async () => {
		await settle("t1", "g1", { stopReason: "end_turn", answer: "hi" });
		expect(calls.at(-1)).toEqual({
			path: "/cli/turns/t1/settled",
			chat: "g1",
			auth: null,
			body: { stopReason: "end_turn", answer: "hi" },
		});
	});

	test("retry with backoff while the API is down, but not when it refuses", async () => {
		calls.length = 0;
		failures = 2;
		await settle("t2", "g1", { stopReason: "end_turn", error: "boom" });
		expect(calls).toHaveLength(3);
		expect(sleeps).toEqual([500, 1000]);
		calls.length = 0;
		await settle("gone", "g1", { stopReason: "cancelled", answer: "" });
		expect(calls).toHaveLength(1);
	});
});
