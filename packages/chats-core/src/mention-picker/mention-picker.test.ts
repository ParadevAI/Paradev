import { describe, expect, test } from "bun:test";
import type { MentionCandidate } from "../mention-candidates/mention-candidates.ts";
import { matchMentions, moveSelection } from "./mention-picker.ts";

const candidate = (label: string, name = label): MentionCandidate => ({
	kind: "dev",
	id: label,
	name,
	label,
	owner: "Yours",
});
const candidates = [
	candidate("Goa trip"),
	candidate("Juniper (yours)", "Juniper"),
	candidate("Juniper (Priya's)", "Juniper"),
];

describe("matchMentions", () => {
	test("by label or any word of the name, case-insensitively, keeping order", () => {
		expect(matchMentions(candidates, "").map((c) => c.label)).toHaveLength(3);
		expect(matchMentions(candidates, "jun").map((c) => c.label)).toEqual([
			"Juniper (yours)",
			"Juniper (Priya's)",
		]);
		expect(matchMentions(candidates, "trip").map((c) => c.label)).toEqual([
			"Goa trip",
		]);
		expect(matchMentions(candidates, "Juniper (p").map((c) => c.label)).toEqual(
			["Juniper (Priya's)"],
		);
		expect(matchMentions(candidates, "goa are we")).toEqual([]);
	});
});

describe("picking", () => {
	test("arrow keys wrap", () => {
		expect(moveSelection(0, -1, 3)).toBe(2);
		expect(moveSelection(2, 1, 3)).toBe(0);
		expect(moveSelection(0, 1, 0)).toBe(0);
	});
});
