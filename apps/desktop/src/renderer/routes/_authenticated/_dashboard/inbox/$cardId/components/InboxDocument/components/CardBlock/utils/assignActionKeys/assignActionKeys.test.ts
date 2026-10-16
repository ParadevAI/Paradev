import { describe, expect, test } from "bun:test";
import { assignActionKeys } from "./assignActionKeys";

describe("the key each action answers to", () => {
	test("the primary action, the card's no, and the rest numbered in the order shown", () => {
		expect(
			assignActionKeys([
				{ id: "dismiss", role: "dismiss" },
				{ id: "void", role: "other" },
				{ id: "mark_uncollectible", role: "other" },
				{ id: "send", role: "primary" },
			]),
		).toEqual({
			dismiss: "dismiss",
			void: "1",
			mark_uncollectible: "2",
			send: "primary",
		});
	});

	test("a second primary or a second no is numbered, so one key never means two actions", () => {
		expect(
			assignActionKeys([
				{ id: "approve", role: "primary" },
				{ id: "approve_all", role: "primary" },
				{ id: "deny", role: "dismiss" },
				{ id: "later", role: "dismiss" },
			]),
		).toEqual({
			approve: "primary",
			approve_all: "1",
			deny: "dismiss",
			later: "2",
		});
	});

	test("a card with no no has no key for it, and actions past nine have none", () => {
		const many = Array.from({ length: 11 }, (_, i) => ({
			id: `a${i}`,
			role: "other" as const,
		}));
		const slots = assignActionKeys(many);
		expect(Object.values(slots)).not.toContain("dismiss");
		expect(slots.a8).toBe("9");
		expect(slots.a9).toBeUndefined();
	});
});
