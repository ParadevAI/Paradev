import { describe, expect, it } from "bun:test";
import { chatAgentChoices } from "./chatAgentChoices";

const config = (
	id: string,
	presetId: string,
	command: string,
	iconId: string | null = null,
) => ({ id, presetId, command, label: id, iconId });

const ICON = "data:image/png;base64,AA==";

describe("chatAgentChoices", () => {
	it("lists every config that chats as a preset as an account of it", () => {
		const { agents, configsFor } = chatAgentChoices([
			config("work", "claude", "claude"),
			config("personal", "custom", "claude", ICON),
			config("team", "custom", "claude"),
			config("codex", "codex", "codex"),
			config("aider", "custom", "aider"),
		]);
		expect(agents.map((agent) => agent.presetId)).toEqual(["claude", "codex"]);
		expect(agents[0]?.accounts).toEqual([
			{ configId: "work", label: "work", iconId: "claude" },
			{ configId: "personal", label: "personal", iconId: ICON },
			{ configId: "team", label: "team", iconId: "claude" },
		]);
		expect(agents[0]?.iconId).toBeUndefined();
		expect(agents[1]?.accounts).toBeUndefined();
		expect(agents[1]?.iconId).toBe("codex");
		expect(configsFor("claude").map((entry) => entry.id)).toEqual([
			"work",
			"personal",
			"team",
		]);
	});

	it("gives a preset with one config that config's icon", () => {
		const { agents } = chatAgentChoices([
			config("personal", "custom", "claude", ICON),
		]);
		expect(agents[0]?.iconId).toBe(ICON);
		expect(agents[0]?.accounts).toBeUndefined();
	});
});
