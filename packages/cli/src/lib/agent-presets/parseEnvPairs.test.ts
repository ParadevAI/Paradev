import { describe, expect, test } from "bun:test";
import { parseEnvPairs } from "./parseEnvPairs";

describe("parseEnvPairs", () => {
	test("parses repeatable pairs into a record", () => {
		expect(parseEnvPairs(["FOO=bar", "BAZ=qux"])).toEqual({
			FOO: "bar",
			BAZ: "qux",
		});
	});

	test("splits on the first = so values can contain =", () => {
		expect(parseEnvPairs(["DSN=postgres://u:p@h/db?a=1"])).toEqual({
			DSN: "postgres://u:p@h/db?a=1",
		});
	});

	test("keeps an explicitly empty value", () => {
		expect(parseEnvPairs(["NO_COLOR="])).toEqual({ NO_COLOR: "" });
	});

	test("lets a later pair win over an earlier one", () => {
		expect(parseEnvPairs(["FOO=first", "FOO=second"])).toEqual({
			FOO: "second",
		});
	});

	test("returns an empty record for no pairs", () => {
		expect(parseEnvPairs([])).toEqual({});
	});

	test("rejects a pair with no =", () => {
		expect(() => parseEnvPairs(["FOO"])).toThrow(/Invalid --env value/);
	});

	test("rejects a pair with an empty key", () => {
		expect(() => parseEnvPairs(["=bar"])).toThrow(/Invalid --env value/);
		expect(() => parseEnvPairs(["  =bar"])).toThrow(/Invalid --env value/);
	});
});
