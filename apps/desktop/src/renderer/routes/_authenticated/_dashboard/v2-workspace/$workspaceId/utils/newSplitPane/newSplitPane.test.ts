import { describe, expect, it } from "bun:test";
import type { ChatPaneData, PaneViewerData } from "../../types";
import { newSplitPane } from "./newSplitPane";

const mint = () => "minted-terminal";

function chat(data: Partial<ChatPaneData>) {
	return {
		kind: "chat-v3",
		data: {
			terminalId: "t-source",
			sessionId: "s-source",
			...data,
		} as PaneViewerData,
	};
}

describe("newSplitPane", () => {
	it("opens a fresh chat with the same agent, model and mode beside a chat", () => {
		const pane = newSplitPane(
			chat({
				agent: { id: "claude", sessionId: "h-1" },
				chatModelId: "opus",
				chatModeId: "plan",
				chatTitle: "Fix the rail",
			}),
			mint,
		);

		expect(pane.kind).toBe("chat-v3");
		expect(pane.titleOverride).toBe("Claude");
		const data = pane.data as ChatPaneData;
		expect(data).toMatchObject({
			sessionId: null,
			agent: { id: "claude" },
			chatModelId: "opus",
			chatModeId: "plan",
		});
		expect(data.terminalId).not.toBe("t-source");
		expect(data.chatTitle).toBeUndefined();
	});

	it("opens a terminal beside a chat whose agent can't run as a chat", () => {
		expect(newSplitPane(chat({}), mint).kind).toBe("terminal");
		expect(newSplitPane(chat({ agent: { id: "amp" } }), mint).kind).toBe(
			"terminal",
		);
	});

	it("opens a terminal beside anything else", () => {
		const pane = newSplitPane(
			{ kind: "terminal", data: { terminalId: "t-1" } as PaneViewerData },
			mint,
		);

		expect(pane).toEqual({
			kind: "terminal",
			data: { terminalId: "minted-terminal", createOnAttach: true },
		} as typeof pane);
		expect(newSplitPane(undefined, mint).kind).toBe("terminal");
	});
});
