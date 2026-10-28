import { expect, test } from "bun:test";
import { agentLoginCommand } from "./agentLogin";

test("signs in the profile the agent launched with", () => {
	expect(agentLoginCommand("claude", {})).toBe("claude auth login");
	expect(
		agentLoginCommand("claude", { CLAUDE_CONFIG_DIR: "/Users/a/.claude-work" }),
	).toBe("CLAUDE_CONFIG_DIR='/Users/a/.claude-work' claude auth login");
	expect(agentLoginCommand("codex", { CODEX_HOME: "/h/it's" })).toBe(
		"CODEX_HOME='/h/it'\\''s' codex login",
	);
	expect(agentLoginCommand("gemini", {})).toBeUndefined();
});
