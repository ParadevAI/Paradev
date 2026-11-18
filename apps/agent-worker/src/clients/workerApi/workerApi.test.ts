import { describe, expect, test } from "bun:test";
import { CHANNEL_MESSAGE_MAX_LENGTH } from "@superset/shared/channels";
import { messageParts } from "./workerApi";

describe("messageParts", () => {
	test("a reply longer than one channel message is split in order, losing nothing", () => {
		const reply = `${"a".repeat(CHANNEL_MESSAGE_MAX_LENGTH)}bc`;
		const parts = messageParts(reply);
		expect(parts.map((part) => part.length)).toEqual([
			CHANNEL_MESSAGE_MAX_LENGTH,
			2,
		]);
		expect(parts.join("")).toBe(reply);
	});

	test("trailing whitespace past the limit doesn't become an empty message", () => {
		const reply = `${"a".repeat(CHANNEL_MESSAGE_MAX_LENGTH)}   \n`;
		expect(messageParts(reply)).toEqual([
			"a".repeat(CHANNEL_MESSAGE_MAX_LENGTH),
		]);
	});
});
