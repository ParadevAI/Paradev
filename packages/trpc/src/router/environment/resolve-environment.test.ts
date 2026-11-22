import { describe, expect, test } from "bun:test";
import { environmentEnvs } from "./resolve-environment";

describe("environmentEnvs", () => {
	test("passes saved PARADEV_ variables except the platform's identity names", () => {
		const rows = [
			{ key: "PARADEV_API_KEY", value: "sk_live_customer" },
			{ key: "PARADEV_FOO", value: "bar" },
			{ key: "PARADEV_WORKSPACE_ID", value: "spoofed" },
			{ key: "SUPERSET_FOO", value: "old-prefix" },
		];
		expect(environmentEnvs(rows, (row) => row.value)).toEqual({
			PARADEV_API_KEY: "sk_live_customer",
			PARADEV_FOO: "bar",
		});
	});
});
