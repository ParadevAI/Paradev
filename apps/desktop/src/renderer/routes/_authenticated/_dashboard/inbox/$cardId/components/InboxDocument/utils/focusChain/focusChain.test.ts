import { describe, expect, test } from "bun:test";
import {
	firstUnsettled,
	focusAfter,
	focusUnits,
	stepFocus,
} from "./focusChain";

const blocks = [
	{ id: "p", type: "paragraph" },
	{ id: "refund", type: "card", actionable: true },
	{
		id: "q",
		type: "ask",
		ask: { questions: [{ id: "notify" }, { id: "note" }] },
	},
	{ id: "needs", type: "card", actionable: false },
	{ id: "cancel", type: "card", actionable: true },
];
const units = focusUnits(blocks);
const none = { blocks: {}, answers: {}, skipped: [] };

describe("which block of a card has focus", () => {
	test("the chain is the cards that wait on the reader and each question, in reading order", () => {
		expect(units).toEqual([
			{ kind: "card", id: "refund" },
			{ kind: "question", id: "notify" },
			{ kind: "question", id: "note" },
			{ kind: "card", id: "cancel" },
		]);
	});

	test("opening a card focuses its first block that is still open", () => {
		expect(firstUnsettled(units, none)).toBe("card:refund");
		expect(
			firstUnsettled(units, {
				...none,
				blocks: { refund: {} },
				answers: { notify: true },
			}),
		).toBe("question:note");
	});

	test("when the focused block settles, focus goes to the next open one below it", () => {
		expect(
			focusAfter(units, { ...none, blocks: { refund: {} } }, "card:refund"),
		).toBe("question:notify");
		expect(
			focusAfter(
				units,
				{
					blocks: { refund: {} },
					answers: { notify: true },
					skipped: ["note"],
				},
				"question:notify",
			),
		).toBe("card:cancel");
	});

	test("with nothing open below, focus returns to an open block above; with nothing open at all there is none", () => {
		expect(
			focusAfter(units, { ...none, blocks: { cancel: {} } }, "card:cancel"),
		).toBe("card:refund");
		expect(
			focusAfter(
				units,
				{
					blocks: { refund: {}, cancel: {} },
					answers: { notify: true, note: "x" },
					skipped: [],
				},
				"card:cancel",
			),
		).toBeNull();
	});

	test("stepping moves over open blocks only and stops at the ends", () => {
		const settled = { ...none, answers: { notify: true } };
		expect(stepFocus(units, settled, "card:refund", 1)).toBe("question:note");
		expect(stepFocus(units, settled, "question:note", -1)).toBe("card:refund");
		expect(stepFocus(units, settled, "card:cancel", 1)).toBe("card:cancel");
		expect(stepFocus(units, settled, null, 1)).toBe("card:refund");
		expect(stepFocus(units, settled, null, -1)).toBe("card:cancel");
	});
});
