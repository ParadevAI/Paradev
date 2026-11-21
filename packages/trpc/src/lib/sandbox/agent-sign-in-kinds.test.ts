import { describe, expect, test } from "bun:test";
import { agentSignInKinds, agentsToRestart } from "./agent-sign-in-kinds";

const kinds = (env: Record<string, string>, chatgptAccount?: string) =>
	agentSignInKinds({
		env,
		codexChatgpt: chatgptAccount
			? {
					accessToken: "t",
					accountId: chatgptAccount,
					identity: {} as never,
				}
			: null,
	});
const booted = kinds({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" });

describe("agentsToRestart", () => {
	test("a new key of the same kind restarts nothing", () => {
		expect(
			agentsToRestart(
				booted,
				kinds({ ANTHROPIC_API_KEY: "b", OPENAI_API_KEY: "p" }),
			),
		).toEqual([]);
	});

	test("a kind change names only that agent", () => {
		expect(
			agentsToRestart(booted, kinds({ ANTHROPIC_API_KEY: "a" }, "acct")),
		).toEqual(["codex"]);
	});

	test("switching an agent to Manual names it", () => {
		expect(
			agentsToRestart(
				booted,
				agentSignInKinds({
					env: { OPENAI_API_KEY: "o" },
					codexChatgpt: null,
					manual: ["claude"],
				}),
			),
		).toEqual(["claude"]);
	});

	test("a disconnect restarts nothing", () => {
		expect(agentsToRestart(booted, kinds({ OPENAI_API_KEY: "o" }))).toEqual([]);
	});

	test("a box booted before kinds were recorded names none", () => {
		expect(
			agentsToRestart(
				"9f86d081884c7d65",
				kinds({ CLAUDE_CODE_OAUTH_TOKEN: "t" }),
			),
		).toEqual([]);
	});
});
