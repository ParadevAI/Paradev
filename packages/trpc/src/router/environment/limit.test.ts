import { describe, expect, test } from "bun:test";
import { assertBelowEnvironmentLimit } from "./limit";

describe("assertBelowEnvironmentLimit", () => {
	test("allows one more while under the limit", () => {
		expect(() => assertBelowEnvironmentLimit(2, 3)).not.toThrow();
	});

	test("refuses at the limit, naming it", () => {
		expect(() => assertBelowEnvironmentLimit(3, 3)).toThrow(
			/environment limit \(3\)/,
		);
	});

	test("an unlimited plan never refuses", () => {
		expect(() =>
			assertBelowEnvironmentLimit(10_000, Number.POSITIVE_INFINITY),
		).not.toThrow();
	});
});
