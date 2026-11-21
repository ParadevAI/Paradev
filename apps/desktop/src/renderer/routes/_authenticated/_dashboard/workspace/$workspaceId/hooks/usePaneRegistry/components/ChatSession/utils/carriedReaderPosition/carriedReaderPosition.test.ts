import { expect, test } from "bun:test";
import {
	carriedReaderPosition,
	carryReaderPosition,
	forgetCarriedReaderPosition,
	keepReaderPosition,
	MAX_CARRIED_POSITIONS,
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

test("keeps the newest positions up to the cap and drops the oldest", () => {
	for (let n = 0; n <= MAX_CARRIED_POSITIONS; n++)
		keepReaderPosition(`kept-${n}`, position);
	expect(carriedReaderPosition("kept-0")).toBeNull();
	expect(carriedReaderPosition(`kept-${MAX_CARRIED_POSITIONS}`)).toEqual(
		position,
	);
	keepReaderPosition(`kept-${MAX_CARRIED_POSITIONS}`, null);
	expect(carriedReaderPosition(`kept-${MAX_CARRIED_POSITIONS}`)).toBeNull();
	for (let n = 1; n < MAX_CARRIED_POSITIONS; n++)
		forgetCarriedReaderPosition(`kept-${n}`);
});
