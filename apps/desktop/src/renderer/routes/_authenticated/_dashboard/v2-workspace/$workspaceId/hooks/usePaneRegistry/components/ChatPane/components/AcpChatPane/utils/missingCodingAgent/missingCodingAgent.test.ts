import { describe, expect, test } from "bun:test";
import { missingCodingAgent } from "./missingCodingAgent";

const LOCAL = {
	hostUrl: "http://127.0.0.1:1",
	localHostUrl: "http://127.0.0.1:1",
};
const claudeMissing =
	"claude was not found, so this chat cannot start. Install claude 2.1.226 or newer and make sure it is on your PATH. Upgrade with: npm i -g @anthropic-ai/claude-code@latest";

describe("missingCodingAgent", () => {
	test("offers the install for Claude Code or Codex on this machine", () => {
		expect(missingCodingAgent(claudeMissing, LOCAL)).toBe("claude");
		expect(
			missingCodingAgent(
				"codex was not found, so this chat cannot start. Install codex.",
				LOCAL,
			),
		).toBe("codex");
	});

	test("keeps the plain error for another host, agent, or failure", () => {
		expect(
			missingCodingAgent(claudeMissing, {
				hostUrl: "https://relay.example/host-2",
				localHostUrl: LOCAL.localHostUrl,
			}),
		).toBeNull();
		expect(
			missingCodingAgent(claudeMissing, {
				hostUrl: LOCAL.hostUrl,
				localHostUrl: null,
			}),
		).toBeNull();
		expect(
			missingCodingAgent(
				"gemini was not found, so this chat cannot start.",
				LOCAL,
			),
		).toBeNull();
		expect(
			missingCodingAgent(
				"claude 2.1.226 or newer is needed for chat, and 2.0.0 is installed.",
				LOCAL,
			),
		).toBeNull();
	});
});
