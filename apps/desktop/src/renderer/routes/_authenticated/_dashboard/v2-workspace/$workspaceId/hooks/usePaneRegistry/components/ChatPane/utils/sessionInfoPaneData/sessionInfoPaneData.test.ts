import { expect, test } from "bun:test";
import { sessionInfoPaneData } from "./sessionInfoPaneData";

test("records the mode the session runs in, so a resume restarts in it", () => {
	expect(
		sessionInfoPaneData(
			{ terminalId: "t", sessionId: "s", agent: { id: "claude" } },
			{ modeId: "bypassPermissions" },
		),
	).toMatchObject({ chatModeId: "bypassPermissions" });
});

test("returns null when nothing changed", () => {
	expect(
		sessionInfoPaneData(
			{
				terminalId: "t",
				sessionId: "s",
				chatTitle: "Title",
				chatModeId: "bypassPermissions",
			},
			{ title: "Title", modeId: "bypassPermissions" },
		),
	).toBeNull();
});
