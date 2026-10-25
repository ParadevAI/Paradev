import { expect, test } from "bun:test";
import {
	bestRemainingAccount,
	launchAccountQuota,
	type LaunchAccount,
	type LaunchQuota,
} from "./launchAccountQuota";

const now = Date.parse("2026-10-25T12:00:00Z");
const account: LaunchAccount = {
	selection: null,
	identity: "identity-a",
	email: "a@example.test",
	label: "System",
};
const second = { ...account, selection: "/second", identity: "identity-b" };
function quota(overrides: Partial<LaunchQuota> = {}): LaunchQuota {
	return {
		agent: "claude",
		selection: null,
		email: account.email,
		credentialKind: "subscription",
		status: "ok",
		fetchedAt: new Date(now),
		windows: [
			{ id: "five_hour", label: "Session", usedPercent: 20, resetsAt: null },
			{ id: "seven_day", label: "Weekly", usedPercent: 40, resetsAt: null },
		],
		...overrides,
	};
}

test("uses the tightest reported basic limit and ignores model-only caps", () => {
	const reading = quota();
	reading.windows.push({ id: "seven_day_sonnet", label: "Sonnet", usedPercent: 100, resetsAt: null });
	expect(launchAccountQuota(account, "claude", [reading], now)?.remaining).toBe(60);
});

test("recognizes a reported weekly-only plan without inventing a session", () => {
	const reading = quota({ agent: "codex" });
	reading.windows = [reading.windows[1]!];
	expect(launchAccountQuota(account, "codex", [reading], now)?.windows).toHaveLength(1);
	expect(bestRemainingAccount([account], "codex", [reading], now)).toBe(account);
});

test("refuses unknown, stale, exhausted, future or mismatched readings", () => {
	const invalid = [
		quota({ status: "unavailable" }),
		quota({ identityChanged: true }),
		quota({ fetchedAt: new Date(now - 6 * 60_000 - 1) }),
		quota({ fetchedAt: new Date(now + 1) }),
		quota({ agent: "codex" }),
		quota({ selection: "/other" }),
		quota({ email: "other@example.test" }),
		quota({ credentialKind: "api_key" }),
		quota({ windows: [] }),
		quota({ windows: [{ id: "five_hour", label: "Session", usedPercent: 100, resetsAt: null }] }),
	];
	for (const reading of invalid)
		expect(bestRemainingAccount([account], "claude", [reading], now)).toBeUndefined();
});

test("per-window age and reset expiry override a fresh outer collection", () => {
	for (const extra of [
		{ observedAt: new Date(now - 7 * 60_000) },
		{ observedAt: "invalid" },
		{ resetsAt: new Date(now) },
		{ resetsAt: "invalid" },
		{ usedPercent: Number.NaN },
	]) {
		const reading = quota();
		Object.assign(reading.windows[0]!, extra);
		expect(bestRemainingAccount([account], "claude", [reading], now)).toBeUndefined();
	}
});

test("ambiguous duplicate profiles and partial passive Claude data are not recommended", () => {
	expect(bestRemainingAccount([account], "claude", [quota(), quota()], now)).toBeUndefined();
	const partial = quota({ windows: [{ id: "five_hour", label: "Session", usedPercent: 1, resetsAt: null, source: "claude_statusline" }] });
	expect(launchAccountQuota(account, "claude", [partial], now)?.remaining).toBe(99);
	expect(bestRemainingAccount([account], "claude", [partial], now)).toBeUndefined();
});

test("ranks only listed immutable choices and uses the default as a tie breaker", () => {
	const firstQuota = quota();
	const secondQuota = quota({ selection: second.selection, isDefault: true });
	expect(bestRemainingAccount([account, second], "claude", [firstQuota, secondQuota], now)).toBe(second);
	secondQuota.windows[1]!.usedPercent = 80;
	expect(bestRemainingAccount([account, second], "claude", [firstQuota, secondQuota], now)).toBe(account);
	expect(bestRemainingAccount([account], "claude", [secondQuota], now)).toBeUndefined();
});
