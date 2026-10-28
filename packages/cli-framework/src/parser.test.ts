import { describe, expect, it } from "bun:test";
import { string } from "./option";
import { parseArgv } from "./parser";

const options = { file: { ...string()._.config, name: "file" } };

describe("parseArgv", () => {
	it("takes a bare - as a positional", () => {
		expect(parseArgv(["", "", "cmd", "-"], options).positionals).toEqual([
			"cmd",
			"-",
		]);
	});

	it("takes a bare - as an option value", () => {
		expect(parseArgv(["", "", "--file", "-"], options).options.file).toBe("-");
	});
});
