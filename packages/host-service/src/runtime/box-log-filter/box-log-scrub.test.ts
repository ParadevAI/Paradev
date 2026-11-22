import { describe, expect, it } from "bun:test";
import { createBoxLogScrub } from "./box-log-scrub";

// Made-up values in the shapes a real box's managed environment holds.
const DATABASE_URL =
	"postgresql://app_owner:npg_Q7rT2mWx9KpL@ep-quiet-sky-pooler.us-east-2.aws.neon.tech/app";
const CLIENT_SECRET = "3f9a1c0e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39";
const PASSWORD = 'p@ss"w\\rd/2024+x=y&z';
const scrub = createBoxLogScrub([
	DATABASE_URL,
	CLIENT_SECRET,
	PASSWORD,
	"3000",
]);

describe("createBoxLogScrub", () => {
	it("leaves an operational text as it is", () => {
		for (const text of [
			"[sandbox] launched (agent, workspace): {} {}",
			"/var/lib/superset/host.db",
			"claude",
			"listening on 3000",
		]) {
			expect(scrub(text)).toBe(text);
		}
	});

	it("returns null for a text that holds a secret raw, JSON-escaped or URL-encoded", () => {
		for (const text of [
			`db ${DATABASE_URL}`,
			`client=${CLIENT_SECRET}`,
			JSON.stringify({ pw: PASSWORD }),
			`?state=${encodeURIComponent(PASSWORD)}`,
		]) {
			expect(scrub(text)).toBeNull();
		}
	});

	it("redacts token shapes that are not one of the values", () => {
		const cases: Array<[string, string]> = [
			[
				"https://x-access-token:ghs_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789@github.com/o/r.git",
				"https://[redacted]@github.com/o/r.git",
			],
			[
				"Authorization: Bearer abc.def-ghi_jkl012",
				"Authorization: Bearer [redacted]",
			],
			["token ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345", "token [redacted]"],
			["key github_pat_11ABCDEFG0abcdefghij_klmnop", "key [redacted]"],
			["stripe sk_live_51HxAbCdEfGhIjKlMn", "stripe [redacted]"],
			["using sk-ant-api03-AbCdEfGhIjKlMnOpQr", "using [redacted]"],
		];
		for (const [text, expected] of cases) {
			expect(scrub(text)).toBe(expected);
		}
	});
});
