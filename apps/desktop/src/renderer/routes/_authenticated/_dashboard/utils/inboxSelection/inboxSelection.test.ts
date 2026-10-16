import { describe, expect, test } from "bun:test";
import {
	afterSettle,
	finishedItemId,
	finishedWorkspaceId,
	moveSelection,
} from "./inboxSelection";

const order = ["a", "b", "c"];

describe("moving through the inbox", () => {
	test("down and up move one row and stop at the ends", () => {
		expect(moveSelection(order, "a", 1)).toBe("b");
		expect(moveSelection(order, "b", -1)).toBe("a");
		expect(moveSelection(order, "c", 1)).toBe("c");
		expect(moveSelection(order, "a", -1)).toBe("a");
	});

	test("with nothing selected, or a selection that left the list, it starts from the near end", () => {
		expect(moveSelection(order, null, 1)).toBe("a");
		expect(moveSelection(order, null, -1)).toBe("c");
		expect(moveSelection(order, "gone", 1)).toBe("a");
		expect(moveSelection([], "a", 1)).toBeNull();
	});

	test("when a card settles, the next one is selected; the last one falls back to the one before", () => {
		expect(afterSettle(order, "a")).toBe("b");
		expect(afterSettle(order, "c")).toBe("b");
		expect(afterSettle(["only"], "only")).toBeNull();
		expect(afterSettle(order, "gone")).toBeNull();
	});

	test("a finished workspace has a list id of its own", () => {
		const id = finishedItemId("d9c838a2");
		expect(finishedWorkspaceId(id)).toBe("d9c838a2");
		expect(
			finishedWorkspaceId("0210bf6c-ad5e-4b5c-823d-0c60e4d9b985"),
		).toBeNull();
	});
});
