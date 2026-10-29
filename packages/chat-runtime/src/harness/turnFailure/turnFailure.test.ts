import { expect, test } from "bun:test";
import type { TurnFailureKind } from "@superset/chat/protocol";
import { classifyTurnFailure, type TurnFailureSignal } from "./turnFailure";

const TABLE: [TurnFailureSignal, TurnFailureKind][] = [
	[{ message: "acp agent exited (code 1)", exited: true }, "crashed"],
	[{ message: "acp agent exited (code 137, signal SIGKILL)" }, "crashed"],
	[{ message: "session/new: the agent did not answer within 120s" }, "timeout"],
	[{ message: "anything", timedOut: true }, "timeout"],
	[{ message: "API Error: Request timed out." }, "timeout"],
	[{ message: "Authentication required", code: -32000 }, "auth"],
	[
		{
			message:
				'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired."}}',
		},
		"auth",
	],
	[{ message: "Invalid API key · Please run /login" }, "auth"],
	[{ message: "unexpected status 401 Unauthorized" }, "auth"],
	[{ message: "Please log out and sign in again." }, "auth"],
	[{ message: "Session not found", code: -32002 }, "session_lost"],
	[{ message: "No conversation found with session ID abc" }, "session_lost"],
	[
		{
			message:
				"There's an issue with the selected model (claude-nope). It may not exist or you may not have access to it. Run /model to pick a different model.",
		},
		"model_unavailable",
	],
	[{ message: "The model `gpt-9` does not exist" }, "model_unavailable"],
	[
		{ message: "prompt is too long: 213000 tokens > 200000 maximum" },
		"context_too_long",
	],
	[
		{
			message:
				"input length and `max_tokens` exceed context limit: 190000 + 32000 > 200000",
		},
		"context_too_long",
	],
	[{ message: "API Error: Connection error." }, "network"],
	[{ message: "fetch failed: ECONNRESET" }, "network"],
	[
		{
			message:
				'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
		},
		"network",
	],
	[{ message: "stream disconnected before completion" }, "network"],
	[
		{
			message:
				"API Error: This request was blocked as it violates our Usage Policy.",
		},
		"refused",
	],
	[{ message: "You've hit your limit · resets 3pm" }, "unknown"],
	[{ message: "The model encountered an unknown error" }, "unknown"],
	[{ message: "TypeError at agent.js:401:12" }, "unknown"],
	[{ message: "Internal error", code: -32603 }, "unknown"],
	[{ message: "Could not open /login/callback.html" }, "unknown"],
	[
		{
			message: "Saved the MCP server credentials to disk, then the tool failed",
		},
		"unknown",
	],
	[
		{ message: "The network tab shows 3 failed requests in the page" },
		"unknown",
	],
	[{ message: "No credentials found for this account" }, "auth"],
	[{ message: "Invalid credentials" }, "auth"],
	[{ message: "Network error while sending the request" }, "network"],
];

test("names each failure the agents report, and leaves the rest unknown", () => {
	for (const [signal, kind] of TABLE) {
		expect({
			message: signal.message,
			kind: classifyTurnFailure(signal),
		}).toEqual({
			message: signal.message,
			kind,
		});
	}
});
