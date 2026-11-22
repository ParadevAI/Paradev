import { describe, expect, test } from "bun:test";
import { Terminal } from "@xterm/headless";
import {
	installTerminalVersionReply,
	TERMINAL_VERSION_NAME,
} from "./terminal-version-reply";

function replies(query: string, install: boolean): Promise<string[]> {
	const terminal = new Terminal({ allowProposedApi: true });
	if (install) installTerminalVersionReply(terminal);
	const sent: string[] = [];
	terminal.onData((data) => sent.push(data));
	return new Promise((resolve) =>
		terminal.write(query, () => {
			terminal.dispose();
			resolve(sent);
		}),
	);
}

describe("installTerminalVersionReply", () => {
	test("answers XTVERSION with a name that does not start with xterm.js", async () => {
		const sent = await replies("\x1b[>q", true);
		expect(sent).toEqual([`\x1bP>|${TERMINAL_VERSION_NAME}\x1b\\`]);
		expect(TERMINAL_VERSION_NAME.startsWith("xterm.js")).toBe(false);
		expect(TERMINAL_VERSION_NAME).toContain("xterm.js");
	});

	test("replaces the stock xterm.js reply", async () => {
		const stock = await replies("\x1b[>q", false);
		expect(stock[0]).toStartWith("\x1bP>|xterm.js(");
	});

	test("ignores XTVERSION with a non-zero parameter", async () => {
		expect(await replies("\x1b[>1q", true)).toEqual([]);
	});
});
