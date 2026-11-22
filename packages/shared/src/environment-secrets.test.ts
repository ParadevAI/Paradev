import { describe, expect, test } from "bun:test";
import { reservedKeyReason } from "./environment-secrets";

describe("reservedKeyReason", () => {
	test("the provider's own credentials are reserved", () => {
		expect(reservedKeyReason("VERCEL_SANDBOX_TOKEN")).toContain(
			"VERCEL_SANDBOX_",
		);
		expect(reservedKeyReason("SUPERSET_WORKSPACE_ID")).toContain("SUPERSET_");
		expect(reservedKeyReason("PARADEV_WORKSPACE_ID")).toContain("PARADEV_");
		expect(reservedKeyReason("path")).toContain("PATH");
	});

	test("a deploy CLI's token is an ordinary variable", () => {
		expect(reservedKeyReason("VERCEL_TOKEN")).toBeNull();
		expect(reservedKeyReason("VERCEL_ORG_ID")).toBeNull();
		expect(reservedKeyReason("PARADEV_API_KEY")).toBeNull();
		expect(reservedKeyReason("PARADEV_FOO")).toBeNull();
		expect(reservedKeyReason("EXPO_TOKEN")).toBeNull();
	});
});
