import { describe, expect, test } from "bun:test";
import { resolveCallbackUrl } from "./resolveCallbackUrl";

const webUrl = "https://app.example.com";
const apiUrl = "https://api.example.com";
const resolve = (redirect: string | null) =>
	resolveCallbackUrl({ redirect, webUrl, trustedOrigins: [apiUrl] });

describe("resolveCallbackUrl", () => {
	test("falls back to the web URL without a redirect", () => {
		expect(resolve(null)).toBe(webUrl);
	});

	test("resolves a path against the web URL", () => {
		expect(resolve("/integrations/slack?x=1")).toBe(
			"https://app.example.com/integrations/slack?x=1",
		);
	});

	test("keeps an absolute URL on a trusted origin", () => {
		const link = `${apiUrl}/api/integrations/slack/link?token=abc&sig=def`;
		expect(resolve(link)).toBe(link);
	});

	test.each([
		"https://evil.example.net/steal",
		"//evil.example.net/steal",
		"javascript:alert(1)",
	])("rejects untrusted redirect %s", (redirect) => {
		expect(resolve(redirect)).toBe(webUrl);
	});
});
