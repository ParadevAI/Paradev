import { describe, expect, it } from "bun:test";
import { CLIError } from "./errors";
import type { ProcessedBuilderConfig } from "./option";
import { parseArgv } from "./parser";

const configs: Record<string, ProcessedBuilderConfig> = {
	prompt: { name: "prompt", aliases: [], type: "string" },
	offset: { name: "offset", aliases: [], type: "number" },
	json: { name: "json", aliases: [], type: "boolean" },
};

function parse(...args: string[]) {
	return parseArgv(["bun", "demo", ...args], configs).options;
}

describe("parseArgv", () => {
	it.each([
		"- fix the tests\n- update the docs",
		"--help me fix the build",
		"---\ntitle: plan\n---",
	])("takes a value that starts with a dash: %p", (value) => {
		expect(parse("--prompt", value)).toEqual({ prompt: value });
	});

	it("takes a negative number", () => {
		expect(parse("--offset", "-1.5")).toEqual({ offset: -1.5 });
	});

	it.each([
		["--json"],
		["--offset=3"],
		["-x"],
		["--unknown"],
		["--", "text"],
		[],
	])("reports a missing value when the option is followed by %p", (...rest) => {
		expect(() => parse("--prompt", ...rest)).toThrow(
			new CLIError("Option --prompt requires a value"),
		);
	});
});
