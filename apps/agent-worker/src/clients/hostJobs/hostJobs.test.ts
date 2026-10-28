import { describe, expect, test } from "bun:test";
import { callHost } from "./hostJobs";

const target = { url: "http://host", bearer: "b" };
const ok = () =>
	Response.json({ result: { data: { json: { status: "done" } } } });

describe("callHost", () => {
	test("retries while the host is unreachable, then returns", async () => {
		const answers = [new Response("down", { status: 502 }), ok()];
		const result = await callHost<{ status: string }>(
			target,
			"output",
			{},
			{
				fetch: (async () => answers.shift()) as unknown as typeof fetch,
				sleep: async () => {},
			},
		);
		expect(result.status).toBe("done");
	});

	test("does not retry a request the host rejected", async () => {
		let calls = 0;
		const call = callHost(
			target,
			"output",
			{},
			{
				fetch: (async () => {
					calls += 1;
					return new Response("{}", { status: 400 });
				}) as unknown as typeof fetch,
				sleep: async () => {},
			},
		);
		await expect(call).rejects.toThrow();
		expect(calls).toBe(1);
	});
});
