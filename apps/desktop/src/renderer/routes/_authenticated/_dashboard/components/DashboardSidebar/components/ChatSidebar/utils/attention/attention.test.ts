import { describe, expect, test } from "bun:test";
import { channelAttention, devAttention, keepsUnder } from "./attention";

describe("channelAttention", () => {
	test("adds mentions, waiting agents and an open question", () => {
		expect(
			channelAttention(
				{ muted: false, mentionCount: 1 },
				{ waiting: 2, working: 3 },
				{ line: "Merge it?", at: 1, asks: true },
			),
		).toEqual({ needsYou: 4, running: 3, asks: true });
	});

	test("a muted channel's mentions do not count", () => {
		expect(
			channelAttention({ muted: true, mentionCount: 5 }, undefined, undefined),
		).toEqual({ needsYou: 0, running: 0, asks: false });
	});
});

describe("devAttention", () => {
	const dev = {
		id: "dev",
		isWorking: false,
		pausedAt: null,
		dmHasUnread: false,
		dmLastMessageBody: "Ship tonight?",
		dmLastMessageAuthorId: "dev",
	};

	test("a Dev whose last word was a question asks you", () => {
		expect(devAttention(dev)).toEqual({
			needsYou: 1,
			running: 0,
			asks: true,
		});
	});

	test("your own question to it does not", () => {
		expect(devAttention({ ...dev, dmLastMessageAuthorId: "me" }).asks).toBe(
			false,
		);
	});

	test("a paused Dev is not running", () => {
		expect(
			devAttention({ ...dev, isWorking: true, pausedAt: new Date() }).running,
		).toBe(0);
	});
});

describe("keepsUnder", () => {
	test("no filter keeps everything", () => {
		expect(keepsUnder(null, { needsYou: 0, running: 0, asks: false })).toBe(
			true,
		);
	});

	test("the filters keep their own rows", () => {
		const row = { needsYou: 0, running: 1, asks: false };
		expect(keepsUnder("running", row)).toBe(true);
		expect(keepsUnder("needsYou", row)).toBe(false);
	});
});
