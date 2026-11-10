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
	});

	test("says a timed-out move timed out, not that it was cancelled", () => {
		expect(describeMoveError("This operation was aborted").reason).toBe(
			"The move timed out.",
		);
	});

	test("explains a host the relay cannot reach", () => {
		expect(describeMoveError("Host is not online").reason).toBe(
			"The workspace couldn't be reached. Check that it is running, then try again.",
		);
	});

	test("explains a cloud workspace that is not running", () => {
		expect(describeMoveError("The cloud workspace is stopped").reason).toBe(
			"The cloud workspace is not running. Start it, then try again.",
		);
	});

	test("drops a procedure path from a readable host error", () => {
		const raw =
			"teleport.prepareWorkspace: Moving a workspace needs a GitHub repository";
		expect(describeMoveError(raw)).toEqual({
			reason: "Moving a workspace needs a GitHub repository",
			details: raw,
		});
	});

	test("explains an unreachable move service", () => {
		expect(describeMoveError("Moves refused the call (500)").reason).toBe(
			"The move service couldn't be reached.",
		);
	});

	test("explains a host too old for the move, keeping the stored text", () => {
		const raw =
			'teleport.importChat: No procedure found on path "teleport.importChat"';
		expect(describeMoveError(raw)).toEqual({
			reason:
				"The other side of the move runs an older version. Restart a cloud workspace or update the computer's host, then try again.",
			details: raw,
		});
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
