import { afterAll, describe, expect, it } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
	findInstalledBinary,
	isOutdatedExecutable,
	parseLaunchPid,
	readRunningExecutable,
} from "./agent-binary";

const root = mkdtempSync(join(tmpdir(), "agent-binary-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function writeExecutable(path: string, content: string): void {
	writeFileSync(path, content);
	chmodSync(path, 0o755);
}

describe("findInstalledBinary", () => {
	it("skips the Superset wrapper and resolves the real binary's symlink", async () => {
		const wrapperDir = join(root, "wrapper-bin");
		const brewDir = join(root, "brew-bin");
		const versionDir = join(root, "Caskroom", "2.1.330");
		for (const dir of [wrapperDir, brewDir, versionDir]) {
			mkdirSync(dir, { recursive: true });
		}
		writeExecutable(
			join(wrapperDir, "claude"),
			"#!/bin/bash\n# Superset agent-wrapper v5\nexec real\n",
		);
		writeExecutable(join(versionDir, "claude"), "binary");
		symlinkSync(join(versionDir, "claude"), join(brewDir, "claude"));

		const path = [join(root, "missing"), wrapperDir, brewDir].join(delimiter);
		const installed = await findInstalledBinary("claude", path);
		expect(installed?.path).toEndWith(join("Caskroom", "2.1.330", "claude"));
		const stats = statSync(join(versionDir, "claude"));
		expect(installed?.fileId).toBe(`${stats.dev}:${stats.ino}`);
		expect(await findInstalledBinary("codex", path)).toBeNull();
	});
});

describe("isOutdatedExecutable", () => {
	it("flags another copy of the same install, never another program", () => {
		const brew = (version: string, fileId: string) => ({
			path: `/opt/homebrew/Caskroom/claude-code@latest/${version}/claude`,
			fileId,
		});
		const native = (version: string, fileId: string) => ({
			path: `/home/u/.local/share/claude/versions/${version}`,
			fileId,
		});
		const npm = { path: "/usr/lib/node_modules/.bin/claude", fileId: "1:5" };

		expect(
			isOutdatedExecutable(brew("2.1.325", "1:1"), brew("2.1.330", "1:2")),
		).toBe(true);
		expect(
			isOutdatedExecutable(native("2.1.325", "1:3"), native("2.1.330", "1:4")),
		).toBe(true);
		expect(isOutdatedExecutable({ ...npm, fileId: "1:6" }, npm)).toBe(true);
		expect(isOutdatedExecutable(npm, npm)).toBe(false);
		expect(
			isOutdatedExecutable({ path: "/usr/local/bin/node", fileId: "1:9" }, npm),
		).toBe(false);
		expect(
			isOutdatedExecutable(
				{ path: "/usr/local/bin/node", fileId: "1:9" },
				{ path: "/usr/local/bin/claude", fileId: "1:10" },
			),
		).toBe(false);
		expect(isOutdatedExecutable(null, npm)).toBe(false);
	});
});

describe("readRunningExecutable", () => {
	it("reads this process's executable from its launch pid", async () => {
		const pid = parseLaunchPid(`${process.pid}-1794900734`);
		expect(pid).toBe(process.pid);
		if (process.platform !== "darwin" && process.platform !== "linux") return;
		const stats = statSync(process.execPath);
		expect(await readRunningExecutable(pid ?? 0)).toEqual({
			path: realpathSync(process.execPath),
			fileId: `${stats.dev}:${stats.ino}`,
		});
	});
});
