import { describe, expect, it } from "bun:test";
import { newChatConfig } from "./newChatConfig";

const configs = [
	{ id: "codex-1", presetId: "codex", command: "codex" },
	{ id: "work", presetId: "claude", command: "claude" },
	{ id: "personal", presetId: "custom", command: "claude" },
	{ id: "aider", presetId: "custom", command: "aider" },
];

describe("newChatConfig", () => {
	it("reopens the last chat's config, then its preset, then Claude", () => {
		expect(newChatConfig(configs, "personal")?.id).toBe("personal");
		expect(newChatConfig(configs, "codex")?.id).toBe("codex-1");
		expect(newChatConfig(configs, undefined)?.id).toBe("work");
		expect(newChatConfig(configs, "aider")?.id).toBe("work");
	});

	it("matches a custom config by the preset it chats as", () => {
		const custom = [
			{ id: "codex-1", presetId: "codex", command: "codex" },
			{ id: "personal", presetId: "custom", command: "claude" },
		];
		expect(newChatConfig(custom, "claude")?.id).toBe("personal");
		expect(newChatConfig(custom, undefined)?.id).toBe("personal");
	});

	it("falls back to any chat config when there is no Claude", () => {
		expect(
			newChatConfig(
				[{ id: "codex-1", presetId: "codex", command: "codex" }],
				"unknown",
			)?.id,
		).toBe("codex-1");
	});
});
