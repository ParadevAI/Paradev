import { afterAll, describe, expect, it } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
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
		expect(await findInstalledBinary("claude", path)).toEndWith(
			join("Caskroom", "2.1.330", "claude"),
		);
		expect(await findInstalledBinary("codex", path)).toBeNull();
	});
});

describe("isOutdatedExecutable", () => {
	it("flags only an older copy of the same binary", () => {
		const installed =
			"/opt/homebrew/Caskroom/claude-code@latest/2.1.330/claude";
		expect(
			isOutdatedExecutable(
				"/opt/homebrew/Caskroom/claude-code@latest/2.1.325/claude",
				installed,
			),
		).toBe(true);
		expect(isOutdatedExecutable(installed, installed)).toBe(false);
		expect(isOutdatedExecutable("/usr/local/bin/node", installed)).toBe(false);
		expect(isOutdatedExecutable(null, installed)).toBe(false);
	});
});

describe("readRunningExecutable", () => {
	it("reads this process's executable from its launch pid", async () => {
		const pid = parseLaunchPid(`${process.pid}-1794900734`);
		expect(pid).toBe(process.pid);
		if (process.platform !== "darwin" && process.platform !== "linux") return;
		expect(await readRunningExecutable(pid ?? 0)).toBe(
			realpathSync(process.execPath),
		);
	});
});
