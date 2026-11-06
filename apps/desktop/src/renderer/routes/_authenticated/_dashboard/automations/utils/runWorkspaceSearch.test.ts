import { describe, expect, it } from "bun:test";
import { runWorkspaceSearch } from "./runWorkspaceSearch";

describe("runWorkspaceSearch", () => {
	it("prefers the exact chat but keeps the terminal id for older viewers", () => {
		expect(
			runWorkspaceSearch({
				sessionKind: "chat",
				chatSessionId: "chat-1",
				terminalSessionId: "terminal-1",
			}),
		).toEqual({ sessionId: "chat-1", terminalId: "terminal-1" });
	});

	it("keeps terminal links for terminal runs and legacy chat runs", () => {
		for (const sessionKind of ["terminal", null]) {
			expect(
				runWorkspaceSearch({
					sessionKind,
					chatSessionId: "old-chat-id",
					terminalSessionId: "terminal-1",
				}),
			).toEqual({ terminalId: "terminal-1" });
		}
		expect(
			runWorkspaceSearch({
				sessionKind: "chat",
				chatSessionId: null,
				terminalSessionId: "terminal-1",
			}),
		).toEqual({ terminalId: "terminal-1" });
	});
});
