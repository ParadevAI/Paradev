import { describe, expect, test } from "bun:test";
import { cliUpdateFor } from "./cli-version";

describe("cliUpdateFor", () => {
	const floors = { minimum: "1.30.0", recommended: "1.40.0" };

	test("below the minimum must update", () => {
		expect(cliUpdateFor("1.29.9", floors)).toBe("required");
	});

	test("between the floors is told an update is available", () => {
		expect(cliUpdateFor("1.35.0", floors)).toBe("recommended");
	});

	test("current builds, unparseable versions and no floors pass", () => {
		expect(cliUpdateFor("1.40.0", floors)).toBeNull();
		expect(cliUpdateFor("dev", floors)).toBeNull();
		expect(cliUpdateFor("0.0.0-dev", floors)).toBeNull();
		expect(
			cliUpdateFor("0.1.0", { minimum: null, recommended: null }),
		).toBeNull();
	});
});
