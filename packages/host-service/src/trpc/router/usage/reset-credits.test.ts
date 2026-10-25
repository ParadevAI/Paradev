import { expect, test } from "bun:test";
import {
	parseClaudeResetCredits,
	parseCodexResetCredits,
} from "./reset-credits";

const now = new Date("2026-10-06T12:00:00Z");
test("Claude inventory counts live grants, even saved resets not usable yet, without private handles", () => {
	const value = parseClaudeResetCredits(
		{
			eligible: true,
			grants: [
				{
					id: "secret-grant",
					resets_left: 2,
					resets_total: 2,
					paused: false,
					usable_now: false,
					ends_at: "2026-10-09T12:00:00Z",
				},
				{ resets_left: 1, paused: true },
				{ resets_left: 1, paused: false, ends_at: "2026-10-01T12:00:00Z" },
			],
		},
		now,
	);
	expect(value.availableCount).toBe(2);
	expect(JSON.stringify(value)).not.toContain("secret-grant");
});
test("absent, malformed and surface-ineligible Claude inventory stays unknown", () => {
	for (const raw of [
		null,
		{},
		{ eligible: false },
		{ eligible: false, ineligible_reason: "surface", grants: [] },
		{
			eligible: true,
			grants: [{ resets_left: 1, paused: false, ends_at: "bad" }],
		},
		{ eligible: true, grants: [{ resets_left: 500, paused: false }] },
	])
		expect(parseClaudeResetCredits(raw, now).availableCount).toBeNull();
	expect(parseClaudeResetCredits({ eligible: true, grants: [] }, now)).toEqual({
		availableCount: 0,
		expirations: [],
		checkedAt: now,
	});
});
test("future and exhausted Claude grants are not available", () => {
	expect(
		parseClaudeResetCredits(
			{
				eligible: true,
				grants: [
					{ resets_left: 0, paused: false },
					{ resets_left: 1, paused: false, starts_at: "2027-01-01T00:00:00Z" },
				],
			},
			now,
		).availableCount,
	).toBe(0);
});
test("Codex count survives details failure; valid details remove expired/redeemed credits", () => {
	expect(
		parseCodexResetCredits({ available_count: 3 }, null, now).availableCount,
	).toBe(3);
	const result = parseCodexResetCredits(
		{ available_count: 3 },
		{
			credits: [
				{ id: "a", status: "available", expires_at: null },
				{ id: "b", status: "available", expires_at: "2026-10-01T00:00:00Z" },
				{ id: "c", status: "redeemed" },
			],
		},
		now,
	);
	expect(result.availableCount).toBe(1);
	expect(JSON.stringify(result)).not.toContain('"id"');
	expect(parseCodexResetCredits(null, null, now).availableCount).toBeNull();
});
test("malformed or duplicate Codex detail does not fabricate an exact count", () => {
	expect(
		parseCodexResetCredits(
			null,
			{ credits: [{ id: "a", status: "available", expires_at: "bad" }] },
			now,
		).availableCount,
	).toBeNull();
	expect(
		parseCodexResetCredits(
			null,
			{
				credits: [
					{ id: "a", status: "available" },
					{ id: "a", status: "available" },
				],
			},
			now,
		).availableCount,
	).toBeNull();
});
