import { describe, expect, test } from "bun:test";
import {
	DEFAULT_NOTIFY_PREFS,
	isOutsideSchedule,
	matchesKeyword,
	type NotifyMessage,
	type NotifyPrefs,
	type NotifyRecipient,
	notifyReason,
} from "./notify-rules";

const ME = "me";
const NOW = new Date("2026-10-26T18:00:00Z");

const recipient = (
	overrides: Partial<NotifyRecipient> = {},
): NotifyRecipient => ({
	userId: ME,
	notify: null,
	muted: false,
	suppressBroadcasts: false,
	followsThread: false,
	...overrides,
});
const message = (overrides: Partial<NotifyMessage> = {}): NotifyMessage => ({
	authorId: "kiet",
	body: "hello",
	mentionedIds: [],
	broadcast: null,
	isReply: false,
	...overrides,
});
const prefs = (overrides: Partial<NotifyPrefs> = {}): NotifyPrefs => ({
	...DEFAULT_NOTIFY_PREFS,
	notify: "mentions",
	...overrides,
});
const reason = (
	r: Partial<NotifyRecipient>,
	m: Partial<NotifyMessage>,
	p: Partial<NotifyPrefs> = {},
) => notifyReason(recipient(r), prefs(p), message(m), NOW);

describe("notifyReason", () => {
	test("never for your own message", () => {
		expect(reason({}, { authorId: ME, mentionedIds: [ME] })).toBeNull();
	});

	test("everything notifies by default", () => {
		expect(
			notifyReason(recipient(), DEFAULT_NOTIFY_PREFS, message(), NOW),
		).toBe("message");
	});

	test("level comes from the channel, else the person's setting", () => {
		expect(reason({}, {})).toBeNull();
		expect(reason({}, {}, { notify: "all" })).toBe("message");
		expect(reason({ notify: "all" }, {})).toBe("message");
		expect(reason({ notify: "mentions" }, {}, { notify: "all" })).toBeNull();
	});

	test("Nothing blocks even a mention", () => {
		expect(reason({ notify: "none" }, { mentionedIds: [ME] })).toBeNull();
	});

	test("a mention or keyword gets through a mute; nothing else does", () => {
		expect(reason({ muted: true }, { mentionedIds: [ME] })).toBe("mention");
		expect(
			reason({ muted: true }, { body: "ship it" }, { keywords: ["ship"] }),
		).toBe("mention");
		expect(reason({ muted: true, notify: "all" }, {})).toBeNull();
		expect(reason({ muted: true }, { broadcast: "channel" })).toBeNull();
		expect(
			reason({ muted: true, followsThread: true }, { isReply: true }),
		).toBeNull();
	});

	test("broadcasts notify; @here is marked for the away check", () => {
		expect(reason({}, { broadcast: "channel" })).toBe("mention");
		expect(reason({}, { broadcast: "everyone" })).toBe("mention");
		expect(reason({}, { broadcast: "here" })).toBe("here");
	});

	test("suppressed broadcasts still notify a channel set to All", () => {
		expect(
			reason({ suppressBroadcasts: true }, { broadcast: "channel" }),
		).toBeNull();
		expect(
			reason(
				{ suppressBroadcasts: true, notify: "all" },
				{ broadcast: "channel" },
			),
		).toBe("mention");
	});

	test("replies: followers and mentions; @here but not @channel", () => {
		expect(reason({}, { isReply: true })).toBeNull();
		expect(reason({ notify: "all" }, { isReply: true })).toBeNull();
		expect(reason({ followsThread: true }, { isReply: true })).toBe("reply");
		expect(reason({}, { isReply: true, mentionedIds: [ME] })).toBe("mention");
		expect(reason({}, { isReply: true, broadcast: "channel" })).toBeNull();
		expect(reason({}, { isReply: true, broadcast: "here" })).toBe("here");
	});

	test("Do Not Disturb blocks everything", () => {
		const pausedUntil = new Date(NOW.getTime() + 60_000);
		expect(reason({}, { mentionedIds: [ME] }, { pausedUntil })).toBeNull();
		const ended = new Date(NOW.getTime() - 60_000);
		expect(reason({}, { mentionedIds: [ME] }, { pausedUntil: ended })).toBe(
			"mention",
		);
	});
});

describe("matchesKeyword", () => {
	test("whole words, any case", () => {
		expect(matchesKeyword("Deploy is done", ["deploy"])).toBe(true);
		expect(matchesKeyword("deployment is done", ["deploy"])).toBe(false);
		expect(matchesKeyword("the on-call rota", ["on-call"])).toBe(true);
		expect(matchesKeyword("anything", ["  "])).toBe(false);
	});
});

describe("isOutsideSchedule", () => {
	// 2026-10-26 is a Monday; 18:00Z is 11:00 in Los Angeles.
	const la = (overrides: Partial<NotifyPrefs>) =>
		prefs({
			scheduleEnabled: true,
			timeZone: "America/Los_Angeles",
			...overrides,
		});

	test("off means always allowed", () => {
		expect(isOutsideSchedule(prefs({}), NOW)).toBe(false);
	});

	test("inside and outside the hours, in the person's time zone", () => {
		expect(isOutsideSchedule(la({}), NOW)).toBe(false);
		expect(isOutsideSchedule(la({ scheduleStartMinute: 12 * 60 }), NOW)).toBe(
			true,
		);
	});

	test("only on the chosen days", () => {
		expect(isOutsideSchedule(la({ scheduleDays: [0, 6] }), NOW)).toBe(true);
	});

	test("a window past midnight belongs to the day it started", () => {
		const night = la({
			scheduleStartMinute: 22 * 60,
			scheduleEndMinute: 2 * 60,
			scheduleDays: [0],
		});
		// 08:00Z Monday is 01:00 Monday in LA: still Sunday's window.
		expect(isOutsideSchedule(night, new Date("2026-10-26T08:00:00Z"))).toBe(
			false,
		);
		expect(isOutsideSchedule(night, NOW)).toBe(true);
	});
});
