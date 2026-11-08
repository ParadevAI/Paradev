import { describe, expect, it } from "bun:test";
import { chatAgentChoices } from "./chatAgentChoices";

const config = (id: string, presetId: string, command: string) => ({
	id,
	presetId,
	command,
	label: id,
});

describe("chatAgentChoices", () => {
	it("lists every config that chats as a preset as an account of it", () => {
		const { agents, configsFor } = chatAgentChoices([
			config("work", "claude", "claude"),
			config("personal", "custom", "claude"),
			config("codex", "codex", "codex"),
			config("aider", "custom", "aider"),
		]);
		expect(agents.map((agent) => agent.presetId)).toEqual(["claude", "codex"]);
		expect(agents[0]?.accounts).toEqual([
			{ configId: "work", label: "work" },
			{ configId: "personal", label: "personal" },
		]);
		expect(agents[1]?.accounts).toBeUndefined();
		expect(configsFor("claude").map((entry) => entry.id)).toEqual([
			"work",
			"personal",
		]);
	});
});
