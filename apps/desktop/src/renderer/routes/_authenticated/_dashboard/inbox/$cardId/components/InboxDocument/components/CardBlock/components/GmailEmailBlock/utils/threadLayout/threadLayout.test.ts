import { describe, expect, test } from "bun:test";
import { threadLayout } from "./threadLayout";

const read = (n: number) =>
	Array.from({ length: n }, () => ({ unread: false }));

describe("threadLayout", () => {
	test("nine read messages: first folded, six behind a count, the last two", () => {
		expect(threadLayout(read(9), new Map(), false)).toEqual([
			{ kind: "message", index: 0, open: false },
			{ kind: "hidden", indexes: [1, 2, 3, 4, 5, 6] },
			{ kind: "message", index: 7, open: false },
			{ kind: "message", index: 8, open: true },
		]);
	});

	test("an unread message in the middle opens and splits the hidden run", () => {
		const messages = read(9);
		messages[4] = { unread: true };
		const rows = threadLayout(messages, new Map(), false);
		expect(rows).toContainEqual({ kind: "message", index: 4, open: true });
		expect(rows).toContainEqual({ kind: "hidden", indexes: [1, 2, 3] });
		expect(rows).toContainEqual({ kind: "hidden", indexes: [5, 6] });
	});

	test("short threads show every message, and a single folded one is never a count", () => {
		expect(threadLayout(read(3), new Map(), false)).toEqual([
			{ kind: "message", index: 0, open: false },
			{ kind: "message", index: 1, open: false },
			{ kind: "message", index: 2, open: true },
		]);
	});

	test("revealing the count lists the folded rows; opening one opens it", () => {
		const rows = threadLayout(read(6), new Map([[2, true]]), true);
		expect(rows.filter((r) => r.kind === "hidden")).toHaveLength(0);
		expect(rows).toContainEqual({ kind: "message", index: 2, open: true });
	});

	test("folding every message closes the last one too", () => {
		const toggled = new Map([0, 1, 2].map((i) => [i, false] as const));
		expect(threadLayout(read(3), toggled, true)).toEqual([
			{ kind: "message", index: 0, open: false },
			{ kind: "message", index: 1, open: false },
			{ kind: "message", index: 2, open: false },
		]);
	});
});
