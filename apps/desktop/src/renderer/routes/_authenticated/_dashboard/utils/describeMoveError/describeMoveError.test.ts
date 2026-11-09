import { describe, expect, test } from "bun:test";
import { MOVE_STOPPED_ANSWERING } from "@superset/shared/move-book";
import { describeMoveError, MOVE_CANCELLED } from "./describeMoveError";

describe("describeMoveError", () => {
	test("explains a move the sweep ended, keeping the stored text", () => {
		expect(describeMoveError(MOVE_STOPPED_ANSWERING)).toEqual({
			reason: "The move stopped responding, so it was ended.",
			details: MOVE_STOPPED_ANSWERING,
		});
	});

	test("says a cancelled move was cancelled", () => {
		expect(describeMoveError(MOVE_CANCELLED).reason).toBe(
			"The move was cancelled.",
		);
		expect(describeMoveError("This operation was aborted").reason).toBe(
			"The move was cancelled.",
		);
	});

	test("explains an unreachable move service", () => {
		expect(describeMoveError("Moves refused the call (500)").reason).toBe(
			"The move service couldn't be reached.",
		);
	});

	test("explains a lost connection", () => {
		expect(describeMoveError("TypeError: Failed to fetch").reason).toBe(
			"The connection was lost.",
		);
	});

	test("keeps a message that is already readable", () => {
		expect(
			describeMoveError("Add acme/web as a project on this computer first"),
		).toEqual({
			reason: "Add acme/web as a project on this computer first",
			details: null,
		});
	});

	test("has a reason when there is no error text", () => {
		expect(describeMoveError(null).reason).toBe(
			"Something went wrong during the move.",
		);
	});
});
