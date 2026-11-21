import { describe, expect, test } from "bun:test";
import {
	type ChannelMessage,
	type ChannelMessagePage,
	PENDING_SEQ,
	pendingMessage,
	upsertIntoPages,
	upsertMessage,
} from "./channelMessageCache";

const message = (seq: number, id = `m${seq}`): ChannelMessage => ({
	...pendingMessage({
		channelId: "c",
		authorId: "u",
		body: "hi",
		clientId: `client-${id}`,
		threadRootId: null,
		mentionedIds: [],
	}),
	id,
	seq,
});

describe("channel message cache", () => {
	test("a confirmed message replaces its pending copy", () => {
		const pending = pendingMessage({
			channelId: "c",
			authorId: "u",
			body: "hi",
			clientId: "k",
			threadRootId: null,
			mentionedIds: [],
		});
		const list = upsertMessage([message(1)], pending);
		expect(list.at(-1)?.seq).toBe(PENDING_SEQ);
		const confirmed = { ...pending, id: "real", seq: 2 };
		expect(upsertMessage(list, confirmed).map((m) => m.id)).toEqual([
			"m1",
			"real",
		]);
	});

	test("new messages join the newest page; edits stay in their page", () => {
		const pages: ChannelMessagePage[] = [
			{ messages: [message(5)], nextCursor: 5 },
			{ messages: [message(1)], nextCursor: null },
		];
		const added = upsertIntoPages(pages, message(6));
		expect(added[0]?.messages.map((m) => m.seq)).toEqual([5, 6]);
		const edited = upsertIntoPages(pages, { ...message(1), body: "edited" });
		expect(edited[1]?.messages[0]?.body).toBe("edited");
		expect(edited[0]?.messages).toHaveLength(1);
		const unloaded = upsertIntoPages(pages.slice(0, 1), message(2));
		expect(unloaded[0]?.messages.map((m) => m.seq)).toEqual([5]);
	});
});
