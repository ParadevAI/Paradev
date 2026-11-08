import { afterEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { createFromClone, createFromEmpty } from "./handlers";

const COMMAND_LINE_TOOLS_STUB_OUTPUT =
	"xcode-select: note: No developer tools were found, requesting install.\n" +
	"If developer tools are located at a non-default location on disk, use `sudo xcode-select --switch path/to/Xcode.app` to specify the Xcode that you wish to use for command line developer tools, and cancel the installation dialog.\n" +
	"See `man xcode-select` for more details.\n";

const originalPath = process.env.PATH;
const tempDirs: string[] = [];

afterEach(() => {
	process.env.PATH = originalPath;
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function useGitWithoutCommandLineTools(): void {
	const binDir = mkdtempSync(join(tmpdir(), "no-clt-bin-"));
	tempDirs.push(binDir);
	const gitPath = join(binDir, "git");
	writeFileSync(
		gitPath,
		`#!/bin/sh\nprintf '%s' '${COMMAND_LINE_TOOLS_STUB_OUTPUT}' >&2\nexit 1\n`,
	);
	chmodSync(gitPath, 0o755);
	process.env.PATH = binDir;
}

describe("createFromEmpty", () => {
	it("reports missing Command Line Tools as a classified git error", async () => {
		const parentDir = mkdtempSync(join(tmpdir(), "empty-project-"));
		tempDirs.push(parentDir);
		useGitWithoutCommandLineTools();

		const error = (await createFromEmpty({} as HostServiceContext, {
			name: "hello",
			parentDir,
		}).catch((err: unknown) => err)) as TRPCError;

		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.cause).toMatchObject({
			kind: "GIT_ENVIRONMENT",
			reason: "COMMAND_LINE_TOOLS_MISSING",
		});
		expect(existsSync(join(parentDir, "hello"))).toBe(false);
	});
});

describe("createFromClone", () => {
	it("reports missing Command Line Tools as a classified git error", async () => {
		const parentDir = mkdtempSync(join(tmpdir(), "clone-project-"));
		tempDirs.push(parentDir);
		useGitWithoutCommandLineTools();

		const error = (await createFromClone({} as HostServiceContext, {
			name: "Hello-World",
			parentDir,
			url: "https://github.com/octocat/Hello-World",
		}).catch((err: unknown) => err)) as TRPCError;

		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.cause).toMatchObject({
			kind: "GIT_ENVIRONMENT",
			reason: "COMMAND_LINE_TOOLS_MISSING",
		});
		expect(existsSync(join(parentDir, "Hello-World"))).toBe(false);
	});
});
