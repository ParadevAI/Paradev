import { describe, expect, test } from "bun:test";
import { type DetectGitDeps, detectGit } from "./detect-git";

type Responses = Record<string, string | Error>;

function makeDeps(
	platform: NodeJS.Platform,
	responses: Responses,
	existingFiles: string[] = [],
) {
	const calls: string[] = [];
	const deps: DetectGitDeps = {
		platform,
		run: async (command, args) => {
			const key = [command, ...args].join(" ");
			calls.push(key);
			const response = responses[key];
			if (response === undefined) throw new Error(`unexpected: ${key}`);
			if (response instanceof Error) throw response;
			return response;
		},
		fileExists: (path) => existingFiles.includes(path),
	};
	return { deps, calls };
}

function commandError(stderr: string, code: string | number = 1) {
	return Object.assign(new Error("Command failed"), { stderr, code });
}

const VERSION = "git version 2.50.1 (Apple Git-155)\n";

describe("detectGit on macOS", () => {
	test("does not run the Apple stub when no developer tools are installed", async () => {
		const { deps, calls } = makeDeps("darwin", {
			"/usr/bin/which git": "/usr/bin/git\n",
			"/usr/bin/xcode-select -p": commandError(
				"xcode-select: error: unable to get active developer directory",
				2,
			),
		});
		expect(await detectGit(deps)).toEqual({
			installed: false,
			version: null,
			needsCommandLineTools: true,
			error: null,
		});
		expect(calls).not.toContain("git --version");
	});

	test("treats a developer directory without git as missing tools", async () => {
		const { deps, calls } = makeDeps("darwin", {
			"/usr/bin/which git": "/usr/bin/git\n",
			"/usr/bin/xcode-select -p": "/Library/Developer/CommandLineTools\n",
		});
		expect((await detectGit(deps)).needsCommandLineTools).toBe(true);
		expect(calls).not.toContain("git --version");
	});

	test("reports git from the Command Line Tools", async () => {
		const { deps } = makeDeps(
			"darwin",
			{
				"/usr/bin/which git": "/usr/bin/git\n",
				"/usr/bin/xcode-select -p": "/Library/Developer/CommandLineTools\n",
				"git --version": VERSION,
			},
			["/Library/Developer/CommandLineTools/usr/bin/git"],
		);
		expect(await detectGit(deps)).toEqual({
			installed: true,
			version: "2.50.1",
			needsCommandLineTools: false,
			error: null,
		});
	});

	test("uses a git outside the stub without asking xcode-select", async () => {
		const { deps, calls } = makeDeps("darwin", {
			"/usr/bin/which git": "/usr/local/bin/git\n",
			"git --version": "git version 2.51.0\n",
		});
		expect((await detectGit(deps)).installed).toBe(true);
		expect(calls).not.toContain("/usr/bin/xcode-select -p");
	});

	test("passes on the reason when the tools exist but git refuses to run", async () => {
		const license =
			"You have not agreed to the Xcode license agreements. Please run 'sudo xcodebuild -license'.";
		const { deps } = makeDeps(
			"darwin",
			{
				"/usr/bin/which git": "/usr/bin/git\n",
				"/usr/bin/xcode-select -p":
					"/Applications/Xcode.app/Contents/Developer\n",
				"git --version": commandError(`${license}\n`),
			},
			["/Applications/Xcode.app/Contents/Developer/usr/bin/git"],
		);
		expect(await detectGit(deps)).toEqual({
			installed: false,
			version: null,
			needsCommandLineTools: false,
			error: license,
		});
	});
});

describe("detectGit on other platforms", () => {
	test("never asks xcode-select", async () => {
		const { deps, calls } = makeDeps("linux", { "git --version": VERSION });
		expect((await detectGit(deps)).installed).toBe(true);
		expect(calls).toEqual(["git --version"]);
	});

	test("reports git missing without a raw spawn error", async () => {
		const { deps } = makeDeps("win32", {
			"git --version": Object.assign(new Error("spawn git ENOENT"), {
				code: "ENOENT",
			}),
		});
		expect(await detectGit(deps)).toEqual({
			installed: false,
			version: null,
			needsCommandLineTools: false,
			error: null,
		});
	});
});
