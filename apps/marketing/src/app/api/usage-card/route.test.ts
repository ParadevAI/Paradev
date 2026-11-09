import { expect, test } from "bun:test";
import { encodeUsageCard } from "@superset/shared/usage-card";
import { GET } from "./route";

test("returns a PNG attachment for a selected public snapshot", async () => {
	const card = encodeUsageCard({
		version: 1,
		period: "November 2026",
		stats: [{ id: "prs", label: "Merged PRs", value: "42" }],
	});
	const response = await GET(
		new Request(`https://paradev.com/api/usage-card?card=${card}&download=1`),
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("image/png");
	expect(response.headers.get("content-disposition")).toBe(
		'attachment; filename="paradev-wrapped.png"',
	);
	expect([...new Uint8Array(await response.arrayBuffer()).slice(0, 8)]).toEqual(
		[137, 80, 78, 71, 13, 10, 26, 10],
	);
});

test("rejects invalid cards before rendering", async () => {
	const response = await GET(
		new Request("https://paradev.com/api/usage-card?card=invalid"),
	);
	expect(response.status).toBe(400);
});
