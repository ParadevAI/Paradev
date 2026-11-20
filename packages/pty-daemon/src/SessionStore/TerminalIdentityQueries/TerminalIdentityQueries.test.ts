import { describe, expect, test } from "bun:test";
import { TERMINAL_VERSION_NAME } from "@superset/shared/constants";
import { TerminalIdentityQueries } from "./TerminalIdentityQueries.ts";

const DA1_QUERY = "\x1b[c";
const DA2_QUERY = "\x1b[>c";
const XTVERSION_QUERY = "\x1b[>q";
const SYNC_QUERY = "\x1b[?2026$p";

const DA1_REPLY = "\x1b[?1;2c";
const DA2_REPLY = "\x1b[>0;276;0c";
const XTVERSION_REPLY = `\x1bP>|${TERMINAL_VERSION_NAME}\x1b\\`;
const SYNC_REPLY = "\x1b[?2026;2$y";

function harness() {
	const parser = new TerminalIdentityQueries();
	const replies: string[] = [];
	const feed = (data: string | Buffer) =>
		parser
			.feed(Buffer.from(data), (reply) => replies.push(reply.toString()))
			.toString();
	return { parser, replies, feed };
}

describe("daemon identification queries", () => {
	test("answers and strips the four tmux/Claude queries", () => {
		const h = harness();
		expect(
			h.feed(`${DA1_QUERY}${DA2_QUERY}${XTVERSION_QUERY}${SYNC_QUERY}`),
		).toBe("");
		expect(h.replies).toEqual([
			DA1_REPLY,
			DA2_REPLY,
			XTVERSION_REPLY,
			SYNC_REPLY,
		]);
	});

	test("accepts the parameterised forms programs also send", () => {
		const h = harness();
		h.feed("\x1b[>0c\x1b[>0q");
		expect(h.replies).toEqual([DA2_REPLY, XTVERSION_REPLY]);
	});

	test("answers each split of every query exactly once", () => {
		const inputs = [DA1_QUERY, DA2_QUERY, XTVERSION_QUERY, SYNC_QUERY];
		for (const input of inputs) {
			const bytes = Buffer.from(`before${input}after`);
			for (let split = 0; split <= bytes.length; split++) {
				const h = harness();
				expect(
					h.feed(bytes.subarray(0, split)) + h.feed(bytes.subarray(split)),
				).toBe("beforeafter");
				expect(h.replies).toHaveLength(1);
			}
		}
	});

	test("handles byte-by-byte adjacent and chained queries", () => {
		const h = harness();
		const input = Buffer.from(`${DA2_QUERY}${XTVERSION_QUERY}`);
		const output = [...input].map((byte) => h.feed(Buffer.from([byte])));
		expect(Buffer.concat([...output].map(Buffer.from)).toString()).toBe("");
		expect(h.replies).toEqual([DA2_REPLY, XTVERSION_REPLY]);
	});

	test("preserves ordinary output, CSI styling and unrelated queries", () => {
		const h = harness();
		const input = [
			"hello",
			"\x1b[2J",
			"\x1b[1;32m",
			"\x1b[?25l", // DECTCEM set — final 'l', not a query.
			"\x1b[6n", // CPR — not one of the four identification queries here.
			"\x1b]11;?\x07", // OSC colour query — owned by TerminalColors.
			"🙂漢字",
		].join("");
		expect(h.feed(input)).toBe(input);
		expect(h.replies).toEqual([]);
	});

	test("a non-CSI ESC sequence is passed through intact", () => {
		const h = harness();
		expect(h.feed("a\x1bXb")).toBe("a\x1bXb");
		expect(h.replies).toEqual([]);
	});

	test("a CSI aborted by a control byte is passed through intact", () => {
		const h = harness();
		expect(h.feed("a\x1b[?2026\x03b")).toBe("a\x1b[?2026\x03b");
		expect(h.replies).toEqual([]);
	});

	test("an overlong CSI is preserved rather than buffered forever", () => {
		const h = harness();
		const input = `\x1b[${"1;".repeat(80)}c`;
		expect(h.feed(input)).toBe(input);
		expect(h.replies).toEqual([]);
	});

	test("snapshot/restore carries parser state across a handoff", () => {
		const h = harness();
		h.feed("\x1b[>");
		const snapshot = h.parser.snapshot();
		const successor = new TerminalIdentityQueries();
		successor.restore(snapshot);
		const replies: string[] = [];
		expect(
			successor
				.feed(Buffer.from("c"), (r) => replies.push(r.toString()))
				.toString(),
		).toBe("");
		expect(replies).toEqual([DA2_REPLY]);
	});

	test("flush returns incomplete bytes instead of dropping them", () => {
		const h = harness();
		h.feed("tail\x1b[>");
		expect(h.parser.flush().toString()).toBe("\x1b[>");
		expect(h.replies).toEqual([]);
	});
});
