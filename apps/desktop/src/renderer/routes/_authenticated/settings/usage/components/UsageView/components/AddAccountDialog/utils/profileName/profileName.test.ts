import { describe, expect, it } from "bun:test";
import type { UsageLogins } from "../../../../../../hooks/useHostUsageLogins";
import { isProfileHomeTaken, slugifyProfileName } from "./profileName";

const logins: UsageLogins = {
	homeDir: "/home/test",
	claude: [
		{
			configDir: "/home/test/.claude-work",
			email: "person@example.com",
			credentialKind: "subscription",
			fingerprint: "token-one",
		},
	],
	codex: [
		{
			home: "/home/test/.codex",
			fingerprint: null,
			credentialKind: "subscription",
		},
		{
			home: "/home/test/.codex-personal",
			fingerprint: "token-two",
			credentialKind: "subscription",
		},
	],
	claudeDefaultEmail: null,
	claudeDefaultFingerprint: null,
};

describe("slugifyProfileName", () => {
	it("has no fallback name", () => {
		expect(slugifyProfileName("")).toBe("");
		expect(slugifyProfileName(" -- ")).toBe("");
	});

	it("keeps only characters that are safe in a dir name and a shell string", () => {
		expect(slugifyProfileName("Work Stuff")).toBe("work-stuff");
		expect(slugifyProfileName('a"$(b)`c')).toBe("a-b-c");
	});
});

describe("isProfileHomeTaken", () => {
	it("flags a name whose home is already a discovered login", () => {
		expect(isProfileHomeTaken(logins, "codex", "personal")).toBe(true);
		expect(isProfileHomeTaken(logins, "claude", "work")).toBe(true);
	});

	it("compares only the agent's own homes", () => {
		expect(isProfileHomeTaken(logins, "codex", "work")).toBe(false);
		expect(isProfileHomeTaken(logins, "claude", "personal")).toBe(false);
	});
});
