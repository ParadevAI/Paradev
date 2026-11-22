import { describe, expect, test } from "bun:test";
import { Terminal } from "@xterm/headless";
import { writeReplayedOutput } from "./terminal-replay-write";
import { installTerminalVersionReply } from "./terminal-version-reply";

const encoder = new TextEncoder();

const QUERIES = {
	DA1: "\x1b[c",
	DA2: "\x1b[>c",
	CPR: "\x1b[6n",
	DSR: "\x1b[5n",
	DECXCPR: "\x1b[?6n",
	"DECRQM ANSI": "\x1b[4$p",
	"DECRQM DEC": "\x1b[?2026$p",
	XTVERSION: "\x1b[>q",
	"kitty keyboard": "\x1b[?u",
	"window size": "\x1b[18t",
	DECRQSS: "\x1bP$qm\x1b\\",
};

function createTerminal() {
	const terminal = new Terminal({
		allowProposedApi: true,
		vtExtensions: { kittyKeyboard: true },
		windowOptions: { getWinSizeChars: true },
	});
	installTerminalVersionReply(terminal);
	const sent: string[] = [];
	terminal.onData((data) => sent.push(data));
	const parsed = () =>
		new Promise<void>((resolve) => terminal.write("", resolve));
	return { terminal, sent, parsed };
}

describe("writeReplayedOutput", () => {
	for (const [name, query] of Object.entries(QUERIES)) {
		test(`${name}: answered live, silent when replayed`, async () => {
			const live = createTerminal();
			live.terminal.write(query);
			await live.parsed();
			expect(live.sent).not.toEqual([]);

			const replayed = createTerminal();
			writeReplayedOutput(replayed.terminal, encoder.encode(query));
			await replayed.parsed();
			expect(replayed.sent).toEqual([]);
		});
	}

	test("live queries on both sides of a replay are still answered once", async () => {
		const { terminal, sent, parsed } = createTerminal();
		terminal.write("\x1b[c");
		writeReplayedOutput(terminal, encoder.encode("old\x1b[c\x1b[6n"));
		terminal.write("\x1b[c");
		await parsed();
		expect(sent).toEqual(["\x1b[?1;2c", "\x1b[?1;2c"]);
	});

	test("replayed output is still drawn", async () => {
		const { terminal, parsed } = createTerminal();
		writeReplayedOutput(terminal, encoder.encode("\x1b[6nprompt$ "));
		await parsed();
		expect(
			terminal.buffer.active.getLine(0)?.translateToString(true),
		).toBe("prompt$ ");
	});
});
