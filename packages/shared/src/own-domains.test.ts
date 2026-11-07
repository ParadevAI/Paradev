import { describe, expect, it } from "bun:test";
import { isOwnHost, withOwnDomainTwins } from "./own-domains";

describe("withOwnDomainTwins", () => {
	it("adds the other root domain for origins, URLs, hosts and CSP sources", () => {
		expect(
			withOwnDomainTwins([
				"https://app.superset.sh",
				"https://paradev.com/pricing",
				"wss://*.superset.sh",
				"api.superset.sh",
			]),
		).toEqual([
			"https://app.superset.sh",
			"https://app.paradev.com",
			"https://paradev.com/pricing",
			"https://superset.sh/pricing",
			"wss://*.superset.sh",
			"wss://*.paradev.com",
			"api.superset.sh",
			"api.paradev.com",
		]);
	});

	it("keeps other hosts and drops empty values", () => {
		expect(
			withOwnDomainTwins([
				"http://localhost:3000",
				"https://notsuperset.sh",
				undefined,
				"",
				false,
			]),
		).toEqual(["http://localhost:3000", "https://notsuperset.sh"]);
	});
});

describe("isOwnHost", () => {
	it("matches both root domains and their subdomains only", () => {
		expect(isOwnHost("superset.sh")).toBe(true);
		expect(isOwnHost("app.paradev.com")).toBe(true);
		expect(isOwnHost("evilparadev.com")).toBe(false);
		expect(isOwnHost("paradev.com.evil.io")).toBe(false);
	});
});
