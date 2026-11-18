import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { userInfo } from "node:os";
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

test("bounds socket paths even when TMPDIR is too long", () => {
	expect(
		Buffer.byteLength(
			terminalHostSocketPath(`/${"h".repeat(120)}`, `/tmp/${"t".repeat(100)}`),
		),
	).toBeLessThan(104);
});
test("rejects a preexisting symlink or shared socket directory", () => {
	const root = mkdtempSync("/tmp/socket-security-");
	const directory = join(root, `paradev-terminal-${userInfo().uid}`);
	try {
		symlinkSync(root, directory);
		expect(() => terminalHostSocketPath(`/${"h".repeat(120)}`, root)).toThrow(
			"not private",
		);
		rmSync(directory);
		mkdirSync(directory, { mode: 0o700 });
		chmodSync(directory, 0o777);
		expect(() => terminalHostSocketPath(`/${"h".repeat(120)}`, root)).toThrow(
			"not private",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
