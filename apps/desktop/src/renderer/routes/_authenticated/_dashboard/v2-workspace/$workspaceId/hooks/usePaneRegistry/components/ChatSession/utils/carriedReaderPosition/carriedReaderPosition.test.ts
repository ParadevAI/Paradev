import { expect, test } from "bun:test";
import {
	carriedReaderPosition,
	carryReaderPosition,
	forgetCarriedReaderPosition,
	trackReaderPosition,
} from "./carriedReaderPosition";

const position = {
	userMessagesFromEnd: 2,
	messageText: "hi",
	rowsAfterMessage: 3,
	offsetPx: 40,
};

test("carries the place read from the old session to its replacement", () => {
	const untrack = trackReaderPosition("old", () => position);
	carryReaderPosition("old", "new");
	untrack();
	expect(carriedReaderPosition("new")).toEqual(position);
	forgetCarriedReaderPosition("new");
	expect(carriedReaderPosition("new")).toBeNull();
});

test("carries nothing when the reader was at the end", () => {
	const untrack = trackReaderPosition("at-end", () => null);
	carryReaderPosition("at-end", "next");
	untrack();
	expect(carriedReaderPosition("next")).toBeNull();
});
