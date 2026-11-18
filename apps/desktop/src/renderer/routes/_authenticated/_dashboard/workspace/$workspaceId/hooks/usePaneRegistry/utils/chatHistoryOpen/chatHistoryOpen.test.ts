import { describe, expect, test } from "bun:test";
import { onOpenChatHistory, openChatHistory } from "./chatHistoryOpen";

describe("chatHistoryOpen", () => {
	test("opens only the pane that registered, and stops once it unsubscribes", () => {
		const opened: string[] = [];
		const unsubscribe1 = onOpenChatHistory("pane-1", () =>
			opened.push("pane-1"),
		);
		const unsubscribe2 = onOpenChatHistory("pane-2", () =>
			opened.push("pane-2"),
		);

		openChatHistory("pane-1");
		expect(opened).toEqual(["pane-1"]);

		unsubscribe1();
		openChatHistory("pane-1");
		expect(opened).toEqual(["pane-1"]);

		unsubscribe2();
	});
});
