import { describe, expect, test } from "bun:test";
import { missingCodingAgent } from "../missingCodingAgent";
import { chatStartFailure } from "./chatStartFailure";

const IDLE = {
	canChat: true,
	sessionId: "chat-1",
	hasClient: true,
	recovering: false,
	liveStartFailure: null,
	sessionDead: false,
	sessionStopped: false,
	createFailure: null,
	storedError: null,
	stored: { live: true },
};
const LOCAL = {
	hostUrl: "http://127.0.0.1:1",
	localHostUrl: "http://127.0.0.1:1",
};

/** What the card decides for a path, with the binary lookup finding nothing. */
function cardFor(input: Parameters<typeof chatStartFailure>[0]) {
	const failure = chatStartFailure(input);
	return {
		path: failure?.path ?? null,
		agent: missingCodingAgent({
			agentId: "claude",
			failed: failure !== null,
			usable: false,
			...LOCAL,
		}),
	};
}

describe("chatStartFailure", () => {
	test("the first chat: live on the host, dead in its transcript", () => {
		expect(
			cardFor({
				...IDLE,
				liveStartFailure: {
					detail:
						"claude was not found, so this chat cannot start. Upgrade with: npm i -g @anthropic-ai/claude-code@latest",
					prompts: [],
				},
			}),
		).toEqual({ path: "live", agent: "claude" });
	});

	test("a new chat the host stopped, whatever its error says", () => {
		expect(
			cardFor({
				...IDLE,
				sessionDead: true,
				stored: { live: false },
				storedError:
					"session/new failed: claude auth status failed: Paradev: claude not found in PATH. Install it and ensure it is on PATH, then retry.",
			}),
		).toEqual({ path: "stopped", agent: "claude" });
	});

	test("a chat the host lost after a failed start", () => {
		expect(
			cardFor({
				...IDLE,
				stored: null,
				createFailure: "spawn ENOENT",
			}),
		).toEqual({ path: "stopped", agent: "claude" });
	});

	test("a chat that could not be created at all", () => {
		expect(
			cardFor({
				...IDLE,
				sessionId: null,
				hasClient: false,
				stored: undefined,
				createFailure: "Internal server error",
			}),
		).toEqual({ path: "create", agent: "claude" });
	});

	test("no failure while the chat runs or recovers", () => {
		expect(chatStartFailure(IDLE)).toBeNull();
		expect(
			chatStartFailure({ ...IDLE, sessionDead: true, recovering: true }),
		).toBeNull();
	});
});
