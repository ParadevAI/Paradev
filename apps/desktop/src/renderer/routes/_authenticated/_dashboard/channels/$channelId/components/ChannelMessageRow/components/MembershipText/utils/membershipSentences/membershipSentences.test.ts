import { describe, expect, test } from "bun:test";
import {
	type ChannelMessage,
	pendingMessage,
} from "renderer/routes/_authenticated/utils/channelMessageCache";
import { membershipSentences } from "./membershipSentences";

const change = (
	author: string,
	subtype: "channel_join" | "channel_leave",
	inviterId: string | null = null,
): ChannelMessage => ({
	...pendingMessage({
		channelId: "c",
		authorId: author,
		body: "",
		clientId: `${author}-${subtype}`,
		threadRootId: null,
		mentionedIds: [],
	}),
	subtype,
	inviterId,
});

describe("membershipSentences", () => {
	test("rolls joins, a rejoin, and a join-then-leave into Slack's sentences", () => {
		expect(
			membershipSentences([
				change("a", "channel_join"),
				change("b", "channel_join"),
				change("c", "channel_leave"),
				change("c", "channel_join"),
				change("d", "channel_join"),
				change("d", "channel_leave"),
			]),
		).toEqual([
			{
				subjectId: "a",
				action: "join",
				inviterId: null,
				otherIds: ["b"],
				first: true,
				also: false,
			},
			{
				subjectId: "c",
				action: "leave,join",
				inviterId: null,
				otherIds: [],
				first: false,
				also: true,
			},
			{
				subjectId: "d",
				action: "join,leave",
				inviterId: null,
				otherIds: [],
				first: false,
				also: false,
			},
		]);
	});

	test("goes along with the lead only when the same person added them", () => {
		const [lead, also] = membershipSentences([
			change("a", "channel_join", "x"),
			change("b", "channel_join", "x"),
			change("c", "channel_join", "y"),
		]);
		expect(lead?.otherIds).toEqual(["b"]);
		expect(also).toMatchObject({ subjectId: "c", action: "join", also: true });
	});
});
