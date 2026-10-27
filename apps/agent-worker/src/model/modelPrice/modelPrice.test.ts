import { describe, expect, test } from "bun:test";
import { createModelPrices } from "./modelPrice";

const headers = { "x-api-key": "k" };

describe("model prices", () => {
	test("uses the router's price, fetched once", async () => {
		let calls = 0;
		const priceOf = createModelPrices({
			fetch: (async () => {
				calls += 1;
				return Response.json({
					models: [
						{
							id: "claude-sonnet-5",
							price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
						},
					],
				});
			}) as unknown as typeof fetch,
		});
		const model = {
			baseUrl: "https://router.test",
			modelId: "claude-sonnet-5",
			headers,
		};
		expect((await priceOf(model)).output).toBe(15);
		await priceOf(model);
		expect(calls).toBe(1);
	});

	test("falls back to pi's Anthropic prices when the router does not answer", async () => {
		const priceOf = createModelPrices({
			fetch: (async () =>
				new Response("no", { status: 404 })) as unknown as typeof fetch,
		});
		const price = await priceOf({
			baseUrl: "https://api.anthropic.com",
			modelId: "claude-sonnet-5-5",
			headers,
		});
		expect(price.input).toBeGreaterThan(0);
		expect(
			(
				await priceOf({
					baseUrl: "https://api.anthropic.com",
					modelId: "made-up",
					headers,
				})
			).input,
		).toBe(0);
	});
});
