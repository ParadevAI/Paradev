import { describe, expect, it } from "bun:test";
import { emptySnapshot, reduceMany } from "@superset/chat/core";
import type { Envelope } from "@superset/chat/protocol";
import { withStoredHistory } from "./withStoredHistory";

function snapshot(epoch: string, messages: [number, string, string][]) {
	return reduceMany(
		emptySnapshot(),
		messages.map(
			([seq, id, text]) =>
				({
					v: 1,
					sessionId: "s1",
					ts: 0,
					cursor: { epoch, seq },
					event: {
						type: "item",
						turnId: "t1",
						item: { id, kind: "agent_message", text, startedAtMs: seq },
					},
				}) as Envelope,
		),
	);
}

const texts = (value: ReturnType<typeof snapshot>) =>
	[...value.items.values()].map(({ item }) => (item as { text: string }).text);

describe("withStoredHistory", () => {
	it("keeps the stored history the host has not sent yet, and the host's version of the rest", () => {
		const stored = snapshot("e1", [
			[1, "a", "first"],
			[2, "b", "second"],
			[3, "c", "third (stored)"],
		]);
		const live = snapshot("e1", [
			[3, "c", "third (live)"],
			[4, "d", "fourth"],
		]);
		expect(texts(withStoredHistory(stored, live))).toEqual([
			"first",
			"second",
			"third (live)",
			"fourth",
		]);
		expect(texts(withStoredHistory(stored, emptySnapshot()))).toEqual([
			"first",
			"second",
			"third (stored)",
		]);
	});

	it("shows only the host's chat once it started a new epoch", () => {
		const stored = snapshot("e1", [[1, "a", "old"]]);
		const live = snapshot("e2", [[1, "z", "new"]]);
		expect(texts(withStoredHistory(stored, live))).toEqual(["new"]);
	});
});
