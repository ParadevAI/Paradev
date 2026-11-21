import { describe, expect, test } from "bun:test";
import {
	type ChannelMessage,
	pendingMessage,
} from "renderer/routes/_authenticated/utils/channelMessageCache";
import { groupMessages } from "./groupMessages";

const at = (seq: number, author: string, iso: string): ChannelMessage => ({
	...pendingMessage({
		channelId: "c",
		authorId: author,
		body: "x",
		clientId: `k${seq}`,
		threadRootId: null,
		mentionedIds: [],
		broadcast: null,
	}),
	id: `m${seq}`,
	seq,
	createdAt: new Date(iso),
});

describe("groupMessages", () => {
	test("compacts one author's burst and breaks on a new day", () => {
		const entries = groupMessages(
			[
				at(1, "a", "2026-10-20T10:00:00"),
				at(2, "a", "2026-10-20T10:02:00"),
				at(3, "a", "2026-10-21T10:03:00"),
			],
			null,
			"me",
		);
		expect(
			entries.map((e) => (e.kind === "message" ? e.compact : e.kind)),
		).toEqual(["day", false, true, "day", false]);
	});

	test("marks the first unread message from someone else", () => {
		const entries = groupMessages(
			[
				at(1, "a", "2026-10-20T10:00:00"),
				at(2, "me", "2026-10-20T10:01:00"),
				at(3, "a", "2026-10-20T10:02:00"),
			],
			1,
			"me",
		);
		const index = entries.findIndex((e) => e.kind === "new");
		expect(entries[index + 1]?.key).toBe("m3");
	});

	test("draws a run of joins as one row, a Dev's apart, and skips them for the New line", () => {
		const join = (seq: number, author: string): ChannelMessage => ({
			...at(seq, author, "2026-10-20T10:00:00"),
			subtype: "channel_join",
		});
		const entries = groupMessages(
			[
				join(1, "a"),
				join(2, "b"),
				join(3, "dev"),
				at(4, "a", "2026-10-20T10:01:00"),
			],
			0,
			"me",
			(id) => id === "dev",
		);
		expect(
			entries.map((e) =>
				e.kind === "message"
					? `${e.key}:${e.rollup?.map((m) => m.id).join("+") ?? "post"}:${e.compact}`
					: e.kind,
			),
		).toEqual(["day", "m1:m1+m2:false", "m3:m3:false", "new", "m4:post:false"]);
	});
});
