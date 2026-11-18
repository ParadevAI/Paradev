import { expect, test } from "bun:test";
import { join } from "node:path";
import { terminalHostSocketPath } from "./socket-path";

test("preserves existing short socket paths", () => {
	expect(terminalHostSocketPath("/tmp/paradev")).toBe(
		"/tmp/paradev/terminal-host.sock",
	);
});

test("long worktree homes get isolated sockets within Darwin's limit", () => {
	const home = `/Users/developer/worktrees/${"long-branch".repeat(12)}`;
	const socket = terminalHostSocketPath(home);
	expect(Buffer.byteLength(socket)).toBeLessThan(104);
	expect(terminalHostSocketPath(join(home, "other"))).not.toBe(socket);
	expect(terminalHostSocketPath(`${home}/`)).toBe(socket);
});
