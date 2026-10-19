import { expect, test } from "bun:test";
import {
	isChatSessionClosed,
	markChatSessionClosed,
	reopenChatSession,
} from "./closedChatSessions";

test("reopening history clears the flag used by pending undo-close stops", () => {
	const sessionId = crypto.randomUUID();
	markChatSessionClosed(sessionId);
	expect(isChatSessionClosed(sessionId)).toBe(true);
	reopenChatSession(sessionId);
	expect(isChatSessionClosed(sessionId)).toBe(false);
});
