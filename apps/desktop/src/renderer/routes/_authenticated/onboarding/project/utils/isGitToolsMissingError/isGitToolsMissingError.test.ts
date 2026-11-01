import { describe, expect, test } from "bun:test";
import { isGitToolsMissingError } from "./isGitToolsMissingError";

describe("isGitToolsMissingError", () => {
	test("matches the stub's no-tools note inside a wrapped error", () => {
		expect(
			isGitToolsMissingError(
				"Failed to clone repository: Error: \nxcode-select: note: No developer tools were found, requesting install.\nIf developer tools are located at a non-default location on disk, use `sudo xcode-select --switch path/to/Xcode.app`.",
			),
		).toBe(true);
	});

	test("matches the stub's cannot-locate-git sentence", () => {
		expect(
			isGitToolsMissingError(
				"xcode-select: Failed to locate 'git', requesting installation of command line developer tools.",
			),
		).toBe(true);
	});

	test("matches host-service's plain message", () => {
		expect(
			isGitToolsMissingError(
				"Git can't run because Apple's Command Line Tools aren't installed on this Mac.",
			),
		).toBe(true);
	});

	test("ignores ordinary git failures", () => {
		expect(
			isGitToolsMissingError(
				"fatal: repository 'https://github.com/org/repo.git/' not found",
			),
		).toBe(false);
	});
});
