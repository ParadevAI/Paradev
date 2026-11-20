import { expect, test } from "bun:test";
import { findStrayChatSessions } from "./findStrayChatSessions";

test("finds the live sessions left on a closed chat's terminal that no pane holds", () => {
	const sessions = [
		{ sessionId: "leaked", terminalId: "closed-pane", live: true },
		{ sessionId: "undoable", terminalId: "closed-pane", live: true },
		{ sessionId: "other-tab", terminalId: "closed-pane", live: true },
		{ sessionId: "stopped", terminalId: "closed-pane", live: false },
		{ sessionId: "elsewhere", terminalId: "open-pane", live: true },
	];
	const strays = findStrayChatSessions(
		sessions,
		"closed-pane",
		new Set(["undoable", "other-tab"]),
	);
	expect(strays.map((session) => session.sessionId)).toEqual(["leaked"]);
});
