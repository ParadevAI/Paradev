import { describe, expect, it } from "bun:test";
import { scrubBoxLogLine } from "./box-log-scrub";

// Made-up values in the shapes a real box's managed environment holds.
const DATABASE_URL =
	"postgresql://app_owner:npg_Q7rT2mWx9KpL@ep-quiet-sky-a1b2c3d4-pooler.us-east-2.aws.neon.tech/app?sslmode=require";
const CLIENT_SECRET = "3f9a1c0e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39";
const STREAMS_SECRET =
	"k8Jd2LmQ9xVb4NcR7tYw1ZpH6sGf3AeU0oIi5KjXlMnBvCzQwErTyUiOpAsDfGhJkLzXcVbNm1234567890qwertyuiopASDFGHJKLzxcvbnmQWERTYUIOPasdfghjklZXCVBNM0987654321mnbvcxzlkjhgfdsapoiuytrewq";
const GIT_AUTHOR_EMAIL = "12345678+someone@users.noreply.github.com";
const QUOTED_PASSWORD = 'p@ss"w\\rd/2024+x=y&z';
const HOST_SECRET = "hs_6c1f0b9e2d8a4f7e93b5c0d1a2e3f4b5";
const PRIVATE_KEY = [
	"-----BEGIN PRIVATE KEY-----",
	"MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj",
	"MzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuictGeurT8jNbvJZHtCSuYEvu",
	"-----END PRIVATE KEY-----",
].join("\n");

const SECRETS = [
	DATABASE_URL,
	CLIENT_SECRET,
	STREAMS_SECRET,
	GIT_AUTHOR_EMAIL,
	QUOTED_PASSWORD,
	HOST_SECRET,
	PRIVATE_KEY,
	"3000",
];

const scrub = (line: string) => scrubBoxLogLine(line, SECRETS);

describe("scrubBoxLogLine", () => {
	it("leaves a line with nothing secret in it as it is", () => {
		for (const line of [
			"1795305352803 host.exec 2.0.11+78482465 node=/opt/superset/host/current/node",
			"[agent-setup] Verified Claude settings.json",
			"[sandbox] start hook running (pid 2134) (command of 25 chars)",
			"1795305369241 memguard rank pid=2152 bun -900->500",
			"[host-service] starting (org=00000000-0000-4000-8000-000000000000, port=3000, NODE_ENV=production)",
		]) {
			expect(scrub(line)).toBe(line);
		}
	});

	it("removes every managed value and the host secret, raw", () => {
		const line = `[sandbox] could not write git user.email Error: Command failed: git config --global user.email ${GIT_AUTHOR_EMAIL} (db ${DATABASE_URL}, client ${CLIENT_SECRET}, gate ${HOST_SECRET}, streams ${STREAMS_SECRET})`;
		const scrubbed = scrub(line);
		for (const secret of SECRETS.slice(0, 6)) {
			expect(scrubbed).not.toContain(secret);
		}
		expect(scrubbed).toContain(
			"Command failed: git config --global user.email [redacted]",
		);
	});

	it("removes a value written inside JSON, where quotes and backslashes are escaped", () => {
		const line = `{"component":"terminal","env":${JSON.stringify({ DB_PASS: QUOTED_PASSWORD })}}`;
		expect(line).not.toContain(QUOTED_PASSWORD);
		expect(scrub(line)).toBe(
			'{"component":"terminal","env":{"DB_PASS":"[redacted]"}}',
		);
	});

	it("removes a value written inside a URL, percent-encoded", () => {
		const line = `[auth] callback https://example.com/cb?state=${encodeURIComponent(QUOTED_PASSWORD)}&ok=1`;
		expect(scrub(line)).toBe(
			"[auth] callback https://example.com/cb?state=[redacted]&ok=1",
		);
	});

	it("drops a line that holds the start, the end or the middle of a value cut by a line break", () => {
		expect(
			scrub(`[sandbox] push failed: ${STREAMS_SECRET.slice(0, 30)}`),
		).toBeNull();
		expect(scrub(`${STREAMS_SECRET.slice(-30)} (truncated)`)).toBeNull();
		expect(scrub(STREAMS_SECRET.slice(40, 100))).toBeNull();
		expect(scrub(`error: ok\n${CLIENT_SECRET.slice(0, 20)}`)).toBeNull();
	});

	it("removes each line of a multi-line value and drops a private key header", () => {
		const bodyLine = PRIVATE_KEY.split("\n")[1] ?? "";
		expect(scrub(bodyLine)).toBe("[redacted]");
		expect(scrub("-----BEGIN PRIVATE KEY-----")).toBeNull();
		expect(scrub("-----BEGIN RSA PRIVATE KEY-----")).toBeNull();
	});

	it("removes token-shaped strings it was not told about", () => {
		const cases: Array<[string, string]> = [
			[
				"fatal: unable to access 'https://x-access-token:ghs_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789@github.com/owner/repo.git/'",
				"fatal: unable to access 'https://[redacted]@github.com/owner/repo.git/'",
			],
			[
				"token ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345 expired",
				"token [redacted] expired",
			],
			[
				"key github_pat_11ABCDEFG0abcdefghij_klmnopqrstuvwxyz",
				"key [redacted]",
			],
			[
				"Authorization: Bearer abc.def-ghi_jkl012",
				"Authorization: Bearer [redacted]",
			],
			["using sk-ant-api03-AbCdEfGhIjKlMnOpQr", "using [redacted]"],
			["aws AKIAIOSFODNN7EXAMPLE ok", "aws [redacted] ok"],
			["slack xoxb-1234567890-abcdefghij", "slack [redacted]"],
			[
				"jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
				"jwt [redacted]",
			],
			[
				"env STRIPE_API_KEY=rk_live_abc123 PORT=4879",
				"env STRIPE_API_KEY=[redacted] PORT=4879",
			],
			[
				'{"accessToken":"opaque-value-1234","n":1}',
				'{"accessToken":"[redacted]","n":1}',
			],
			[
				"postgres://user:hunter2@db.internal:5432/app",
				"postgres://[redacted]@db.internal:5432/app",
			],
		];
		for (const [line, expected] of cases) {
			expect(scrubBoxLogLine(line, [])).toBe(expected);
		}
	});

	it("does not treat a value shorter than eight characters as a secret", () => {
		expect(scrub("[host-service] listening on port 3000")).toBe(
			"[host-service] listening on port 3000",
		);
	});
});
