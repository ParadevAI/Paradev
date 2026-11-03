import { describe, expect, it } from "bun:test";
import {
	type ChannelMessage,
	PENDING_SEQ,
} from "renderer/routes/_authenticated/utils/channelMessageCache";
import { countsAsUnread, unreadState } from "./unreadState";

function message(
	seq: number,
	authorId: string,
	deleted = false,
): ChannelMessage {
	return {
		id: `m${seq}`,
		channelId: "c",
		seq,
		threadRootId: null,
		authorId,
		body: "hi",
		subtype: null,
		inviterId: null,
		mentionedIds: [],
		broadcast: null,
		clientId: null,
		replyCount: 0,
		lastReplyAt: null,
		editedAt: null,
		deletedAt: deleted ? new Date() : null,
		createdAt: new Date(),
		reactions: [],
		attachments: [],
	} as ChannelMessage;
}

describe("unreadState", () => {
	it("skips your own, deleted and pending messages", () => {
		const state = unreadState(
			[
				message(1, "them"),
				message(2, "me"),
				message(3, "them", true),
				message(4, "them"),
				message(PENDING_SEQ, "me"),
			],
			1,
			"me",
		);
		expect(state.firstUnread?.seq).toBe(4);
		expect(state.unreadCount).toBe(1);
		expect(state.latestSeq).toBe(4);
	});

	it("has no first unread when only your messages follow the read point", () => {
		const state = unreadState([message(1, "them"), message(2, "me")], 1, "me");
		expect(state.firstUnread).toBeNull();
		expect(state.latestSeq).toBe(2);
	});

	it("skips joins and leaves except the reader being added by someone", () => {
		const join = (authorId: string, inviterId: string | null) => ({
			...message(1, authorId),
			subtype: "channel_join" as const,
			inviterId,
		});
		expect(countsAsUnread(join("a", null), "me")).toBe(false);
		expect(countsAsUnread(join("a", "b"), "me")).toBe(false);
		expect(countsAsUnread(join("me", null), "me")).toBe(false);
		expect(countsAsUnread(join("me", "b"), "me")).toBe(true);
	});
});
