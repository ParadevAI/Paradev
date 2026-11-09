import { describe, expect, test } from "bun:test";
import {
	decodeUsageCard,
	encodeUsageCard,
	renderUsageCardSvg,
	type UsageCard,
} from "./index";

const card: UsageCard = {
	version: 1,
	period: "2026年10月 — 2026年11月",
	stats: [{ id: "tokens", label: "トークン", value: "123M" }],
};

describe("usage card links", () => {
	test("round-trips translated text in a URL-safe snapshot", () => {
		const encoded = encodeUsageCard(card);
		expect(encoded).toMatch(/^[\w-]+$/);
		expect(decodeUsageCard(encoded)).toEqual(card);
	});

	test("rejects malformed, oversized and unexpected private fields", () => {
		for (const input of [
			null,
			"!",
			"x".repeat(8001),
			Buffer.from(JSON.stringify({ ...card, repository: "secret" })).toString(
				"base64url",
			),
		]) {
			expect(decodeUsageCard(input)).toBeNull();
		}
	});

	test("rejects a breakdown column for an unselected stat", () => {
		expect(() =>
			encodeUsageCard({
				...card,
				breakdown: {
					label: "Agents",
					columns: [{ id: "cost", label: "Estimated cost" }],
					rows: [{ name: "Claude", values: ["$200"] }],
				},
			}),
		).toThrow();
	});

	test("escapes model text before embedding it in the SVG", () => {
		const svg = renderUsageCardSvg({
			...card,
			stats: [{ id: "model", label: "Model", value: '<script>"&' }],
		});
		expect(svg).toContain("&lt;script&gt;&quot;&amp;");
		expect(svg).not.toContain("<script>");
	});
});
