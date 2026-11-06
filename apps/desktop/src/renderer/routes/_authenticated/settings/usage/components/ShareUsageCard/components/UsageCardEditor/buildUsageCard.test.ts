import { expect, test } from "bun:test";
import {
	type CardStatId,
	decodeUsageCard,
	encodeUsageCard,
} from "@superset/shared/usage-card";
import {
	buildUsageCard,
	DEFAULT_CARD_STATS,
	type WrappedSummary,
} from "./buildUsageCard";

const data: WrappedSummary = {
	from: "2026-10-07",
	to: "2026-11-05",
	tokens: 123456,
	usd: 197.43,
	prs: 12,
	longestStreak: 8,
	topModel: "test-model",
	agents: [{ agent: "claude", tokens: 123456, usd: 197.43, prs: 12 }],
};
const labels: Record<CardStatId, string> = {
	prs: "PRs",
	tokens: "Tokens",
	cost: "Estimated cost",
	model: "Top model",
	agents: "Agents",
	streak: "Streak",
	tier: "Tier",
};
const options = {
	data,
	tier: 3,
	selected: new Set(DEFAULT_CARD_STATS),
	showBreakdown: true,
	labels,
	breakdownLabel: "Agents",
};

test("default sharing excludes cost from the card and every agent row", () => {
	const card = buildUsageCard(options);
	expect(card).not.toBeNull();
	if (!card) return;
	const snapshot = JSON.stringify(decodeUsageCard(encodeUsageCard(card)));
	expect(snapshot).not.toContain("197");
	expect(snapshot).not.toContain("cost");
	expect(card.breakdown?.columns.map((column) => column.id)).toEqual([
		"tokens",
		"prs",
	]);
});

test("cost is included only after opt-in and hidden stats stay out of the breakdown", () => {
	const card = buildUsageCard({ ...options, selected: new Set(["cost"]) });
	expect(card?.stats.map((stat) => stat.id)).toEqual(["cost"]);
	expect(card?.breakdown?.columns.map((column) => column.id)).toEqual(["cost"]);
	expect(card?.breakdown?.rows[0]?.values).toHaveLength(1);
});

test("hiding the breakdown removes agent identities and selecting nothing disables sharing", () => {
	expect(
		buildUsageCard({ ...options, showBreakdown: false })?.breakdown,
	).toBeUndefined();
	expect(buildUsageCard({ ...options, selected: new Set() })).toBeNull();
	expect(buildUsageCard({ ...options, data: undefined })).toBeNull();
});
