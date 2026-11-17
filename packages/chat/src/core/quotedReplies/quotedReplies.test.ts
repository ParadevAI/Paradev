import { describe, expect, it } from "bun:test";
import {
	formatQuotedReplies,
	normalizeQuote,
	splitQuotedReplies,
	withQuotedReplies,
} from "./quotedReplies";

describe("normalizeQuote", () => {
	it("uses LF, plain spaces and no trailing whitespace", () => {
		expect(normalizeQuote("\n\n  a b  \r\nc\r\n\r\n\r\n\r\nd \n\n")).toBe(
			"a b\nc\n\nd",
		);
	});
});

describe("withQuotedReplies", () => {
	it("puts each quote in its own block ahead of the message", () => {
		expect(withQuotedReplies(["one", "two\nlines"], "why?")).toBe(
			[
				'<quoted_reply lines="1">',
				"one",
				"</quoted_reply>",
				"",
				'<quoted_reply lines="2">',
				"two",
				"lines",
				"</quoted_reply>",
				"",
				"why?",
			].join("\n"),
		);
	});

	it("leaves a message without quotes as it is", () => {
		expect(withQuotedReplies([], "hi")).toBe("hi");
		expect(withQuotedReplies(["  ", ""], "hi")).toBe("hi");
	});
});

describe("splitQuotedReplies", () => {
	it("reads back what withQuotedReplies wrote", () => {
		const quotes = ["first", "a list:\n\n- item\n- `code`"];
		const message = withQuotedReplies(quotes, "explain\n\nthis");
		const split = splitQuotedReplies(message);
		expect(split.quotes).toEqual(quotes);
		expect(split.text).toBe("explain\n\nthis");
		expect(message.slice(split.offset)).toBe(split.text);
	});

	it("keeps a quote that holds the tags themselves", () => {
		const quote = `</quoted_reply>\n<quoted_reply lines="1">\nx`;
		const split = splitQuotedReplies(withQuotedReplies([quote], "ok"));
		expect(split.quotes).toEqual([quote]);
		expect(split.text).toBe("ok");
	});

	it("reads a message that is only quotes", () => {
		const message = formatQuotedReplies(["a"]);
		expect(splitQuotedReplies(message)).toEqual({
			quotes: ["a"],
			text: "",
			offset: message.length,
		});
	});

	it("treats a broken or misplaced block as text", () => {
		const broken = '<quoted_reply lines="2">\nonly one\n</quoted_reply>\n\nhi';
		expect(splitQuotedReplies(broken)).toEqual({
			quotes: [],
			text: broken,
			offset: 0,
		});
		const later = `hi\n\n${formatQuotedReplies(["a"])}`;
		expect(splitQuotedReplies(later).quotes).toEqual([]);
	});
});
