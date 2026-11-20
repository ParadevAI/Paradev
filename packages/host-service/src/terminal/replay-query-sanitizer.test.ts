import { describe, expect, test } from "bun:test";
import { HeadlessTerminal } from "./headless-xterm";
import { sanitizeReplayedQueries } from "./replay-query-sanitizer";

const encoder = new TextEncoder();

async function repliesFor(raw: string): Promise<string[]> {
	const term = new HeadlessTerminal({ allowProposedApi: true });
	const replies: string[] = [];
	term.onData((data) => replies.push(data));
	await new Promise<void>((resolve) =>
		term.write(sanitizeReplayedQueries(encoder.encode(raw)), () => resolve()),
	);
	return replies;
}

async function rawRepliesFor(raw: string): Promise<string[]> {
	const term = new HeadlessTerminal({ allowProposedApi: true });
	const replies: string[] = [];
	term.onData((data) => replies.push(data));
	await new Promise<void>((resolve) =>
		term.write(encoder.encode(raw), () => resolve()),
	);
	return replies;
}

describe("sanitizeReplayedQueries", () => {
	test("a plain CPR that used to draw a reply is now silent", async () => {
		expect(await rawRepliesFor("\x1b[6n")).not.toEqual([]);
		expect(await repliesFor("\x1b[6n")).toEqual([]);
	});

	test("device attributes, XTVERSION and DECRQM stop producing input", async () => {
		const raw = "\x1b[c\x1b[>0q\x1b[?1$p";
		expect((await rawRepliesFor(raw)).length).toBeGreaterThan(0);
		expect(await repliesFor(raw)).toEqual([]);
	});

	test("OSC colour queries are silenced", async () => {
		expect(await repliesFor("here\x1b]11;?\x07done")).toEqual([]);
	});

	test("ordinary output and non-query control sequences are untouched", () => {
		const raw = encoder.encode("hello\x1b[2J\x1b[1;32mworld");
		expect(sanitizeReplayedQueries(raw)).toBe(raw);
	});

	test("length is preserved so stream offsets stay valid", () => {
		for (const raw of [
			"\x1b[6n",
			"\x1b[c\x1b]11;?\x07",
			"a\x1b[?1$pb\x1b[>0qc",
		]) {
			const bytes = encoder.encode(raw);
			expect(sanitizeReplayedQueries(bytes).byteLength).toBe(bytes.byteLength);
		}
	});

	test("only query bytes are zeroed inside a realistic replay", () => {
		const bytes = encoder.encode("before\x1b[6nafter");
		const out = sanitizeReplayedQueries(bytes);
		expect(Buffer.from(out).toString("latin1")).toBe(
			"before\u0000\u0000\u0000\u0000after",
		);
	});
});
