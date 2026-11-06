import { expect, test } from "bun:test";
import { sessionInfoPaneData } from "./sessionInfoPaneData";

test("records the model, effort and mode the session runs on, so a resume restarts on them", () => {
	expect(
		sessionInfoPaneData(
			{
				terminalId: "t",
				sessionId: "s",
				agent: { id: "claude" },
				chatModelId: "launched-with",
			},
			{ modelId: "switched-to", effortId: "high", modeId: "bypassPermissions" },
		),
	).toMatchObject({
		chatModelId: "switched-to",
		chatEffortId: "high",
		chatModeId: "bypassPermissions",
	});
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
