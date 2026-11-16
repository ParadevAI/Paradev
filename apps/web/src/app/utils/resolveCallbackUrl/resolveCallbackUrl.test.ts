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

test.each([
	"https://api.superset.sh",
	"https://api.paradev.com",
])("accepts both API twins configured from %s", (apiUrl) => {
	for (const origin of ["https://api.superset.sh", "https://api.paradev.com"]) {
		const redirect = `${origin}/api/integrations/slack/link?token=abc&sig=def`;
		expect(
			resolveCallbackUrl({ redirect, webUrl, trustedOrigins: [apiUrl] }),
		).toBe(redirect);
	}
});

test.each([
	"https://api.paradev.com.evil.test",
	"https://evil.paradev.com",
	"http://api.paradev.com",
	"https://api.paradev.com:444",
	"https://api.paradev.com@evil.test",
])("rejects an origin outside the configured twins: %s", (origin) => {
	expect(
		resolveCallbackUrl({
			redirect: `${origin}/steal`,
			webUrl,
			trustedOrigins: ["https://api.superset.sh"],
		}),
	).toBe(webUrl);
});
