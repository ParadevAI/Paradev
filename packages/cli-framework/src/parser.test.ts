import { describe, expect, it } from "bun:test";
import { CLIError } from "./errors";
import type { ProcessedBuilderConfig } from "./option";
import { parseArgv } from "./parser";

const configs: Record<string, ProcessedBuilderConfig> = {
	prompt: { name: "prompt", aliases: [], type: "string" },
	offset: { name: "offset", aliases: [], type: "number" },
	json: { name: "json", aliases: [], type: "boolean" },
	"2fa": { name: "2fa", aliases: ["2"], type: "string" },
};

function parse(...args: string[]) {
	return parseArgv(["bun", "demo", ...args], configs).options;
}

describe("parseArgv", () => {
	it.each([
		"- fix the tests\n- update the docs",
		"--help me fix the build",
		"---\ntitle: plan\n---",
		"-1",
	])("takes a value that starts with a dash: %p", (value) => {
		expect(parse("--prompt", value)).toEqual({ prompt: value });
	});

	it("takes a bare - as a value", () => {
		expect(parse("--prompt", "-")).toEqual({ prompt: "-" });
	});

	it("takes a bare - as a positional", () => {
		expect(
			parseArgv(["bun", "demo", "cmd", "a", "-"], configs).positionals,
		).toEqual(["cmd", "a", "-"]);
	});

	it("takes an option-shaped value after =", () => {
		expect(parse("--prompt=--3d")).toEqual({ prompt: "--3d" });
	});

	it("takes a negative number", () => {
		expect(parse("--offset", "-1.5")).toEqual({ offset: -1.5 });
	});

	it.each([
		["--json"],
		["--offset=3"],
		["-x"],
		["--unknown"],
		["--3d"],
		["--foo.bar"],
		["--2fa"],
		["--2fa=123456"],
		["-2"],
		["--", "text"],
		[],
	])("reports a missing value when the option is followed by %p", (...rest) => {
		expect(() => parse("--prompt", ...rest)).toThrow(
			new CLIError("Option --prompt requires a value"),
		);
	});
});
