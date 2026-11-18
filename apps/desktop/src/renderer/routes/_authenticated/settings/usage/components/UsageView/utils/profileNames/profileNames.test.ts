import { describe, expect, it } from "bun:test";
import type { UsageLogins } from "../../../../hooks/useHostUsageLogins";
import { freeProfileName, isProfileSignedIn } from "./profileNames";

const empty: UsageLogins = {
	homeDir: "/home/test",
	claude: [],
	codex: [],
	claudeDefaultEmail: null,
	claudeDefaultFingerprint: null,
};
const claudeAt = (configDir: string) => ({
	configDir,
	email: "person@example.com",
	credentialKind: "subscription" as const,
	fingerprint: "token",
});
const codexAt = (home: string) =>
	({
		home,
		credentialKind: "subscription",
		fingerprint: "token",
	}) as UsageLogins["codex"][number];

describe("profileNames", () => {
	it("defaults to work on a host with no profiles", () =>
		expect(freeProfileName(empty, "claude")).toBe("work"));

	it("skips names already signed in, so a second add keeps the first account", () => {
		const logins = {
			...empty,
			claude: [
				claudeAt("/home/test/.claude-work"),
				claudeAt("/home/test/.claude-work-2"),
			],
		};
		expect(isProfileSignedIn(logins, "claude", "work")).toBe(true);
		expect(freeProfileName(logins, "claude")).toBe("work-3");
	});

	it("checks Codex profiles by home, apart from Claude", () => {
		const logins = { ...empty, codex: [codexAt("/home/test/.codex-work")] };
		expect(freeProfileName(logins, "codex")).toBe("work-2");
		expect(freeProfileName(logins, "claude")).toBe("work");
	});

	it("matches a profile the host lists with Windows separators or a trailing-slash home", () => {
		const windows = {
			...empty,
			homeDir: "C:\\Users\\kiet",
			claude: [claudeAt("C:\\Users\\kiet\\.claude-work")],
		};
		const trailing = {
			...empty,
			homeDir: "/home/test/",
			claude: [claudeAt("/home/test/.claude-work")],
		};
		expect(isProfileSignedIn(windows, "claude", "work")).toBe(true);
		expect(isProfileSignedIn(trailing, "claude", "work")).toBe(true);
	});
});
