import { afterEach, expect, test } from "bun:test";
import {
	displayText,
	emptySnapshot,
	reduce,
	reduceMany,
	type SessionSnapshot,
} from "@superset/chat/core";
import type { Envelope } from "@superset/chat/protocol";
import { cleanup, renderHook } from "@testing-library/react";
import { useStoredHistory } from "./useStoredHistory";

afterEach(cleanup);

function item(seq: number, id: string, text: string): Envelope {
	return {
		v: 1,
		sessionId: "s1",
		ts: 0,
		cursor: { epoch: "e1", seq },
		event: {
			type: "item",
			turnId: "t1",
			item: { id, kind: "agent_message", text, startedAtMs: seq },
		},
	} as Envelope;
}

function delta(itemId: string, append: string): Envelope {
	return {
		v: 1,
		sessionId: "s1",
		ts: 0,
		delta: { type: "text", itemId, append },
	} as Envelope;
}

test("a streamed delta keeps the merged items, and its text still shows", () => {
	const stored = reduceMany(emptySnapshot(), [
		item(1, "a", "first"),
		item(2, "b", "second"),
	]);
	const live = reduceMany(emptySnapshot(), [
		item(1, "a", "first"),
		item(2, "b", "second"),
		item(3, "c", ""),
	]);
	const { result, rerender } = renderHook(
		(snapshot: SessionSnapshot) => useStoredHistory(stored, snapshot),
		{ initialProps: live },
	);
	const before = result.current;

	rerender(reduce(live, delta("c", "streaming")));

	expect(result.current.items).toBe(before.items);
	expect(result.current.turns).toBe(before.turns);
	expect(displayText(result.current, "c")).toBe("streaming");
});

test("keeps the stored history in front of a live chat that starts later", () => {
	const stored = reduceMany(emptySnapshot(), [
		item(1, "a", "first"),
		item(2, "b", "second"),
	]);
	const live = reduceMany(emptySnapshot(), [item(2, "b", "second (live)")]);
	const { result, rerender } = renderHook(
		(snapshot: SessionSnapshot) => useStoredHistory(stored, snapshot),
		{ initialProps: live },
	);
	const before = result.current;

	rerender(reduce(live, delta("b", "!")));

	expect([...result.current.items.keys()]).toEqual(["a", "b"]);
	expect(result.current.items).toBe(before.items);
	expect(displayText(result.current, "b")).toBe("second (live)!");
});

test("returns the live chat when there is no stored one", () => {
	const live = reduceMany(emptySnapshot(), [item(1, "a", "first")]);
	const { result } = renderHook(() => useStoredHistory(null, live));
	expect(result.current).toBe(live);
});
