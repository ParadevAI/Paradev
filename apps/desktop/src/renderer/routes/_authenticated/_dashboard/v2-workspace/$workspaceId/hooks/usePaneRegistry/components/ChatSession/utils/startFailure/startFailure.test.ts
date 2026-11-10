import { describe, expect, it } from "bun:test";
import {
	emptySnapshot,
	type OutboxEntry,
	reduceMany,
} from "@superset/chat/core";
import type { Envelope, Item, SessionState } from "@superset/chat/protocol";
import { agentCliMissingMessage } from "@superset/host-service/acp-catalogue";
import { startFailure } from "./startFailure";

let seq = 0;
function envelope(event: Envelope["event"]): Envelope {
	seq += 1;
	return {
		v: 1,
		sessionId: "s1",
		ts: 0,
		cursor: { epoch: "e1", seq },
		event,
	} as Envelope;
}
const session = (state: Partial<SessionState>) =>
	envelope({
		type: "session",
		session: { status: "idle", harness: "claude-acp", ...state },
	} as Envelope["event"]);
const item = (value: Record<string, unknown>) =>
	envelope({
		type: "item",
		turnId: "t1",
		item: { startedAtMs: seq, ...value } as Item,
	} as Envelope["event"]);

const prompt = [{ type: "text" as const, text: "Explain this repository" }];
const missing = `${agentCliMissingMessage("claude")} Install claude 2.1.226 or newer and make sure it is on your PATH. Upgrade with: npm i -g @anthropic-ai/claude-code@latest`;

describe("startFailure", () => {
	it("reads the missing agent from a chat the host still reports as live", () => {
		const snapshot = reduceMany(emptySnapshot(), [
			session({ status: "starting" }),
			item({ id: "u1", kind: "user_message", clientId: "c1", content: prompt }),
			item({ id: "n1", kind: "notice", noticeKind: "error", text: missing }),
		]);
		const queued: OutboxEntry = {
			commandId: "k2",
			clientId: "c2",
			content: [{ type: "text", text: "hi" }],
			state: "queued",
			attempts: 0,
			lastError: null,
		};
		expect(startFailure(snapshot, [queued])).toEqual({
			detail: missing,
			prompts: [prompt, queued.content],
		});
	});

	it("is null once the agent has answered", () => {
		const snapshot = reduceMany(emptySnapshot(), [
			item({ id: "u1", kind: "user_message", content: prompt }),
			item({ id: "a1", kind: "agent_message", text: "Hello" }),
			item({ id: "n1", kind: "notice", noticeKind: "error", text: missing }),
		]);
		expect(startFailure(snapshot)).toBeNull();
	});
});
