import { expect, test } from "bun:test";
import {
	bestRemainingAccount,
	type LaunchAccount,
	type LaunchQuota,
	launchAccountQuota,
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

function fixtureWindow(reading: LaunchQuota, index: number) {
	const window = reading.windows[index];
	if (!window) throw new Error("Missing fixture quota window");
	return window;
}

test("uses the tightest reported basic limit and ignores model-only caps", () => {
	const reading = quota();
	reading.windows.push({
		id: "seven_day_sonnet",
		label: "Sonnet",
		usedPercent: 100,
		resetsAt: null,
	});
	expect(launchAccountQuota(account, "claude", [reading], now)?.remaining).toBe(
		60,
	);
});

test("recognizes a reported weekly-only plan without inventing a session", () => {
	const reading = quota({ agent: "codex" });
	reading.windows = [fixtureWindow(reading, 1)];
	expect(
		launchAccountQuota(account, "codex", [reading], now)?.windows,
	).toHaveLength(1);
	expect(bestRemainingAccount([account], "codex", [reading], now)).toBe(
		account,
	);
});

test("refuses unknown, stale, exhausted, future or mismatched readings", () => {
	const invalid = [
		quota({ status: "unavailable" }),
		quota({ identityChanged: true }),
		quota({ fetchedAt: new Date(now - 16 * 60_000 - 1) }),
		quota({ fetchedAt: new Date(now + 1) }),
		quota({ agent: "codex" }),
		quota({ selection: "/other" }),
		quota({ email: "other@example.test" }),
		quota({ credentialKind: "api_key" }),
		quota({ windows: [] }),
		quota({
			windows: [
				{ id: "five_hour", label: "Session", usedPercent: 100, resetsAt: null },
			],
		}),
	];
	for (const reading of invalid)
		expect(
			bestRemainingAccount([account], "claude", [reading], now),
		).toBeUndefined();
});

test("per-window age and reset expiry override a fresh outer collection", () => {
	for (const extra of [
		{ observedAt: new Date(now - 17 * 60_000) },
		{ observedAt: "invalid" },
		{ resetsAt: new Date(now) },
		{ resetsAt: "invalid" },
		{ usedPercent: Number.NaN },
	]) {
		const reading = quota();
		Object.assign(fixtureWindow(reading, 0), extra);
		expect(
			bestRemainingAccount([account], "claude", [reading], now),
		).toBeUndefined();
	}
});

test("ambiguous duplicate profiles and partial passive Claude data are not recommended", () => {
	expect(
		bestRemainingAccount([account], "claude", [quota(), quota()], now),
	).toBeUndefined();
	const partial = quota({
		windows: [
			{
				id: "five_hour",
				label: "Session",
				usedPercent: 1,
				resetsAt: null,
				source: "claude_statusline",
			},
		],
	});
	expect(launchAccountQuota(account, "claude", [partial], now)?.remaining).toBe(
		99,
	);
	expect(
		bestRemainingAccount([account], "claude", [partial], now),
	).toBeUndefined();
});

test("ranks only listed immutable choices and uses the default as a tie breaker", () => {
	const firstQuota = quota();
	const secondQuota = quota({ selection: second.selection, isDefault: true });
	expect(
		bestRemainingAccount(
			[account, second],
			"claude",
			[firstQuota, secondQuota],
			now,
		),
	).toBe(second);
	fixtureWindow(secondQuota, 1).usedPercent = 80;
	expect(
		bestRemainingAccount(
			[account, second],
			"claude",
			[firstQuota, secondQuota],
			now,
		),
	).toBe(account);
	expect(
		bestRemainingAccount([account], "claude", [secondQuota], now),
	).toBeUndefined();
});

test("best remaining stays available throughout the provider's fifteen-minute cadence", () => {
	for (const minutes of [6, 9, 14, 15, 16]) {
		const reading = quota({ fetchedAt: new Date(now - minutes * 60_000) });
		for (const window of reading.windows) window.source = "provider";
		expect(bestRemainingAccount([account], "claude", [reading], now)).toBe(
			account,
		);
	}
	expect(
		bestRemainingAccount(
			[account],
			"claude",
			[quota({ fetchedAt: new Date(now - 16 * 60_000 - 1) })],
			now,
		),
	).toBeUndefined();
});

test("fresh complete native limits can be recommended despite an old HTTP account date", () => {
	const reading = quota({ fetchedAt: new Date(now - 90 * 60_000) });
	for (const window of reading.windows) {
		window.source = "claude_statusline";
		window.observedAt = new Date(now - 60_000);
	}
	expect(bestRemainingAccount([account], "claude", [reading], now)).toBe(
		account,
	);
	expect(reading.fetchedAt).toEqual(new Date(now - 90 * 60_000));
	expect(reading.windows.map((window) => window.observedAt)).toEqual([
		new Date(now - 60_000),
		new Date(now - 60_000),
	]);
});

test("mixed native and provider limits keep separate ages and never freshen a sibling", () => {
	const reading = quota({ fetchedAt: new Date(now - 60 * 60_000) });
	Object.assign(fixtureWindow(reading, 0), {
		source: "claude_sdk",
		observedAt: new Date(now - 2 * 60_000),
	});
	Object.assign(fixtureWindow(reading, 1), {
		source: "provider",
		observedAt: new Date(now - 15 * 60_000),
	});
	expect(bestRemainingAccount([account], "claude", [reading], now)).toBe(
		account,
	);
	fixtureWindow(reading, 1).observedAt = new Date(now - 16 * 60_000 - 1);
	expect(
		bestRemainingAccount([account], "claude", [reading], now),
	).toBeUndefined();
	fixtureWindow(reading, 1).observedAt = new Date(now - 60_000);
	fixtureWindow(reading, 0).observedAt = new Date(now - 6 * 60_000 - 1);
	expect(
		bestRemainingAccount([account], "claude", [reading], now),
	).toBeUndefined();
});

test("current global fetch time cannot hide stale, future or unknown native observations", () => {
	for (const extra of [
		{ source: "claude_sdk", observedAt: new Date(now - 6 * 60_000 - 1) },
		{ source: "claude_statusline", observedAt: new Date(now + 1) },
		{ source: "unknown", observedAt: new Date(now) },
	]) {
		const reading = quota();
		Object.assign(fixtureWindow(reading, 0), extra);
		expect(
			bestRemainingAccount([account], "claude", [reading], now),
		).toBeUndefined();
	}
});

test("retained, changed-login and unavailable rows cannot recommend fresh-looking windows", () => {
	for (const extra of [
		{ historical: true },
		{ retained: true },
		{ identityChanged: true },
		{ status: "unavailable" },
	]) {
		const reading = quota(extra);
		for (const window of reading.windows) {
			window.source = "claude_statusline";
			window.observedAt = new Date(now);
		}
		expect(
			bestRemainingAccount([account], "claude", [reading], now),
		).toBeUndefined();
	}
});

test("duplicate partial native session observations do not prove weekly capacity", () => {
	const reading = quota();
	reading.windows = [0, 1].map(() => ({
		id: "five_hour",
		label: "Session",
		usedPercent: 1,
		resetsAt: null,
		source: "claude_sdk",
		observedAt: new Date(now),
	}));
	expect(launchAccountQuota(account, "claude", [reading], now)?.remaining).toBe(
		99,
	);
	expect(
		bestRemainingAccount([account], "claude", [reading], now),
	).toBeUndefined();
});
