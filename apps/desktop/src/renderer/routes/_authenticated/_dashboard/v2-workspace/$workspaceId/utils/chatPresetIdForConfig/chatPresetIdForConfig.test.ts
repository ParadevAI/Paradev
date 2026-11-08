import { describe, expect, it } from "bun:test";
import { chatPresetIdForConfig } from "./chatPresetIdForConfig";

describe("chatPresetIdForConfig", () => {
	it("chats a custom agent as the CLI it runs, and refuses one with no chat", () => {
		expect(
			chatPresetIdForConfig({ presetId: "claude", command: "claude" }),
		).toBe("claude");
		expect(
			chatPresetIdForConfig({ presetId: "custom", command: "claude" }),
		).toBe("claude");
		expect(
			chatPresetIdForConfig({ presetId: "custom", command: "aider" }),
		).toBeNull();
	});
});
