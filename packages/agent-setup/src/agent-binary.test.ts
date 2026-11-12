import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
	isWrapperBinDir,
	meetsMinVersion,
	resolveAgentBinary,
} from "./agent-binary";
import { managedAgentBinaryPath } from "./managed-agent-binaries";
import { getBinDir } from "./paths";

const HOME = "/home/u";

function resolve(
	executables: string[],
	pathValue: string,
	platform: NodeJS.Platform = "darwin",
) {
	return resolveAgentBinary("claude", pathValue, {
		platform,
		homeDir: HOME,
		isExecutable: (file) => executables.includes(file),
	});
}

describe("resolveAgentBinary", () => {
	test("skips every wrapper dir, then takes the user's own install", () => {
		const wrapperDirs = [
			getBinDir(),
			`${HOME}/.paradev/bin`,
			`${HOME}/.paradev-dev/bin`,
			`${HOME}/.superset/bin`,
			`${HOME}/.superset-canary/bin`,
		];
		const pathValue = [...wrapperDirs, "/opt/homebrew/bin"].join(":");
		expect(
			resolve(
				[
					...wrapperDirs.map((dir) => `${dir}/claude`),
					"/opt/homebrew/bin/claude",
				],
				pathValue,
			),
		).toEqual({ path: "/opt/homebrew/bin/claude", source: "path" });
		expect(isWrapperBinDir(`${HOME}/projects/bin`, HOME)).toBe(false);
	});

	test("falls back to the copy the app installed", () => {
		const managed = managedAgentBinaryPath("claude");
		expect(resolve([managed], "/usr/bin:/bin")).toEqual({
			path: managed,
			source: "paradev",
		});
		expect(resolve([], "/usr/bin:/bin")).toBeNull();
	});

	test("finds claude.exe on Windows", () => {
		const dir = "C:\\Users\\u\\.local\\bin";
		const exe = path.join(dir, "claude.exe");
		expect(resolve([exe], `C:\\Windows;${dir}`, "win32")).toEqual({
			path: exe,
			source: "path",
		});
	});
});

describe("meetsMinVersion", () => {
	test("compares major, minor and patch, and lets an unreadable version through", () => {
		expect(meetsMinVersion("2.1.322", "2.1.226")).toBe(true);
		expect(meetsMinVersion("2.1.9", "2.1.226")).toBe(false);
		expect(meetsMinVersion("0.160.0", "0.160.0")).toBe(true);
		expect(meetsMinVersion("1.0.0-beta.1", "0.160.0")).toBe(true);
		expect(meetsMinVersion("dev", "2.1.226")).toBe(true);
	});
});
