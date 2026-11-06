import { describe, expect, test } from "bun:test";
import type { Item, UserMessage } from "@superset/chat/protocol";
import type { TranscriptRow } from "../transcriptRows";
import { speakerStarts } from "./speakerStarts";

const MINUTE = 60_000;
// A real clock; zero is the outbox's "no time yet".
const T0 = 1_800_000_000_000;

function said(
	key: string,
	kind: "user_message" | "agent_message",
	at: number,
	extra: Partial<Extract<TranscriptRow, { kind: "item" }>> = {},
): TranscriptRow {
	const item =
		kind === "user_message"
			? ({ id: key, kind, startedAtMs: at, content: [] } as UserMessage)
			: ({ id: key, kind, startedAtMs: at, text: "" } as Item);
	return { kind: "item", key, groupStart: false, item, ...extra };
}

function clock(key: string, at: number, folded = false): TranscriptRow {
	return {
		kind: "working",
		key,
		groupStart: true,
		startedAtMs: at,
		completedAtMs: at + 1000,
		running: false,
		waiting: false,
		...(folded ? { folded: true, foldKey: "working:earlier" } : {}),
	};
}

const noNotes = () => false;
const oneDay = () => "day";

describe("speakerStarts", () => {
	test("each turn of the conversation starts a run, the reply under its clock does not", () => {
		const starts = speakerStarts(
			[
				said("ask", "user_message", T0),
				clock("work", T0 + 1000),
				said("reply", "agent_message", T0 + 2000),
				said("ask-2", "user_message", T0 + MINUTE),
				clock("work-2", T0 + MINUTE + 1000),
			],
			noNotes,
			{ dayOf: oneDay },
		);
		expect([...starts.keys()]).toEqual(["ask", "work", "ask-2", "work-2"]);
		expect(starts.get("work")).toEqual({
			speaker: "agent",
			at: T0 + 1000,
			newDay: false,
		});
	});

	test("one speaker's messages stay one run until five quiet minutes pass", () => {
		const starts = speakerStarts(
			[
				said("a", "user_message", T0),
				said("b", "user_message", T0 + MINUTE),
				said("c", "user_message", T0 + 10 * MINUTE),
			],
			noNotes,
			{ dayOf: oneDay },
		);
		expect([...starts.keys()]).toEqual(["a", "c"]);
	});

	test("folded work and the harness's own notes do not break a run", () => {
		const note = said("note", "user_message", T0 + 3000);
		const starts = speakerStarts(
			[
				said("ask", "user_message", T0),
				clock("work", T0 + 1000),
				said("narration", "agent_message", T0 + 2000, { folded: true }),
				note,
				clock("woken", T0 + 4000, true),
				said("reply", "agent_message", T0 + 5000),
			],
			(item) => item.id === "note",
			{ dayOf: oneDay },
		);
		expect([...starts.keys()]).toEqual(["ask", "work"]);
	});

	test("a new day starts a run under a divider", () => {
		const starts = speakerStarts(
			[
				said("monday", "user_message", T0),
				said("tuesday", "user_message", T0 + MINUTE),
			],
			noNotes,
			{ dayOf: (at) => (at < T0 + MINUTE ? "mon" : "tue") },
		);
		expect(starts.get("monday")?.newDay).toBe(true);
		expect(starts.get("tuesday")?.newDay).toBe(true);
	});

	test("history a resumed session replayed keeps its speakers but shows no time or day", () => {
		const starts = speakerStarts(
			[
				said("old-ask", "user_message", T0),
				clock("old-work", T0 + 1),
				said("ask", "user_message", T0 + MINUTE),
			],
			noNotes,
			{ dayOf: oneDay, untimed: (row) => row.key.startsWith("old") },
		);
		expect(starts.get("old-ask")).toEqual({
			speaker: "user",
			at: null,
			newDay: false,
		});
		expect(starts.get("old-work")?.at).toBeNull();
		expect(starts.get("ask")).toEqual({
			speaker: "user",
			at: T0 + MINUTE,
			newDay: false,
		});
	});

	test("a prompt sent through the CLI is the relay's, not the person's", () => {
		const relayedAsk = said("relayed", "user_message", T0 + 2000);
		const starts = speakerStarts(
			[
				said("ask", "user_message", T0),
				clock("work", T0 + 1000),
				relayedAsk,
				said("ask-2", "user_message", T0 + 3000),
			],
			noNotes,
			{ dayOf: oneDay, relayed: (item) => item.id === "relayed" },
		);
		expect(starts.get("relayed")?.speaker).toBe("relay");
		expect(starts.get("ask-2")?.speaker).toBe("user");
	});
});
