import { describe, expect, test } from "bun:test";
import { oauthResource } from "./oauth-resource";

describe("oauthResource", () => {
	test("sends the canonical API for both production API hosts", () => {
		expect(oauthResource("https://api.paradev.com")).toBe(
			"https://api.superset.sh",
		);
		expect(oauthResource("https://api.superset.sh")).toBe(
			"https://api.superset.sh",
		);
	});

	test("keeps any other API URL", () => {
		expect(oauthResource("http://localhost:3001")).toBe(
			"http://localhost:3001",
		);
		expect(oauthResource("https://api.stage.paradev.com")).toBe(
			"https://api.stage.paradev.com",
		);
	});
});
