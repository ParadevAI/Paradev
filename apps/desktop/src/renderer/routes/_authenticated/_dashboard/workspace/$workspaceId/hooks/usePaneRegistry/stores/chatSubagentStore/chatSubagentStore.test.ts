import { expect, test } from "bun:test";
import { useChatSubagentStore } from "./chatSubagentStore";

test("forgetting a closed chat drops its open subagent and path", () => {
	const { open, setPath, forget } = useChatSubagentStore.getState();
	open("chat-closed", "subagent:c1");
	setPath("chat-closed", [{ id: "subagent:c1", title: "Explore" }]);
	open("chat-kept", "subagent:c2");

	forget("chat-closed");

	const { opened, paths } = useChatSubagentStore.getState();
	expect(opened["chat-closed"]).toBeUndefined();
	expect(paths["chat-closed"]).toBeUndefined();
	expect(opened["chat-kept"]).toBe("subagent:c2");
});
