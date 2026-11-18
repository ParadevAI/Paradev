import { describe, expect, it } from "bun:test";
import type { OutboxEntry } from "@superset/chat/core";
import { splitOutbox } from "./splitOutbox";

function entry(patch: Partial<OutboxEntry>): OutboxEntry {
	return {
		commandId: "command",
		clientId: "client",
		content: [{ type: "text", text: "hi" }],
		state: "inflight",
		attempts: 1,
		lastError: null,
		...patch,
	};
}

describe("splitOutbox", () => {
	it("shows a sent prompt as a message while no turn runs", () => {
		const outbox = [entry({})];
		const split = splitOutbox(outbox, false);
		expect(split.transcript).toBe(outbox);
		expect(split.queue).toEqual([]);
	});

	it("shows a prompt sent during a running turn in the queue", () => {
		for (const state of ["inflight", "queued"] as const) {
			const split = splitOutbox([entry({ state })], true);
			expect(split.transcript).toEqual([]);
			expect(split.queue).toEqual([
				{
					id: "client",
					kind: "user_message",
					clientId: "client",
					startedAtMs: 0,
					content: [{ type: "text", text: "hi" }],
					queued: true,
				},
			]);
		}
	});

	it("keeps a prompt that is unsent, failed, or steers the turn as a message", () => {
		const outbox = [
			entry({ clientId: "unsent", state: "queued", attempts: 0 }),
			entry({ clientId: "failed", state: "failed" }),
			entry({ clientId: "steer", steer: { expectedTurnId: "turn" } }),
		];
		const split = splitOutbox(outbox, true);
		expect(split.transcript).toBe(outbox);
		expect(split.queue).toEqual([]);
	});
});
