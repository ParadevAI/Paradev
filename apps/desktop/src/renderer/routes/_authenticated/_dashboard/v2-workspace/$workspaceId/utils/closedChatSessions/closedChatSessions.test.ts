import { describe, expect, it } from "bun:test";
import {
	ignoreChatTerminal,
	isChatSessionClosed,
	isChatTerminalIgnored,
	markChatSessionClosed,
} from "./closedChatSessions";

describe("closedChatSessions", () => {
	it("forgets the oldest entries past a cap, keeping the newest", () => {
		for (let index = 0; index < 600; index++) {
			markChatSessionClosed(`capped-session-${index}`);
			ignoreChatTerminal(`capped-terminal-${index}`);
		}
		expect(isChatSessionClosed("capped-session-0")).toBe(false);
		expect(isChatSessionClosed("capped-session-599")).toBe(true);
		expect(isChatTerminalIgnored("capped-terminal-0")).toBe(false);
		expect(isChatTerminalIgnored("capped-terminal-599")).toBe(true);
	});
});
