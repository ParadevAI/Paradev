import { expect, test } from "bun:test";
import {
	canDeferClaudeHttpQuota,
	createNativeClaudeQuotaOverlay,
	mergeNativeClaudeQuota,
} from "./native-claude-overlay";
import type { NativeClaudeUsageWindow } from "./native-claude-usage";

const now = 1_800_000_000_000;
const base = () => ({
	status: "unavailable" as const,
	statusDetail: "Usage endpoint returned 429.",
	email: "fixture@example.test",
	windows: [],
	fetchedAt: new Date(now - 20 * 60_000),
	extraUsage: { usedCents: 20, limitCents: 100 },
	retryAt: new Date(now + 60_000),
	prepaidBalance: {
		amount: 15,
		currency: "USD",
		checkedAt: new Date(now - 20 * 60_000),
	},
	lastKnownUsage: { fetchedAt: new Date(now - 30 * 60_000), windows: [] },
});
const reading = (
	id: "five_hour" | "seven_day",
	change: Partial<NativeClaudeUsageWindow> = {},
): NativeClaudeUsageWindow => ({
	id,
	usedPercent: 25,
	resetsAt: now + 60_000,
	observedAt: now - 1000,
	source: "claude_statusline",
	...change,
});
test("native windows rescue a transient reading without refreshing financial or HTTP dates", () => {
	const original = base();
	const merged = mergeNativeClaudeQuota(
		original,
		[reading("five_hour"), reading("seven_day")],
		now,
	);
	expect(merged?.status).toBe("ok");
	expect(merged?.fetchedAt).toBe(original.fetchedAt);
	expect(merged?.prepaidBalance).toBe(original.prepaidBalance);
	expect(merged?.extraUsage).toBe(original.extraUsage);
	expect(merged?.retryAt).toBe(original.retryAt);
	expect(merged?.lastKnownUsage).toBe(original.lastKnownUsage);
	expect(merged?.windows.map((window) => window.source)).toEqual([
		"claude_statusline",
		"claude_statusline",
	]);
	expect(original.windows).toEqual([]);
	expect(merged && canDeferClaudeHttpQuota(original, merged, now)).toBe(true);
});
test("partial, stale, future, expired and malformed native observations never imply full coverage", () => {
	const original = base();
	const partial = mergeNativeClaudeQuota(original, [reading("five_hour")], now);
	expect(partial?.windows.map((window) => window.id)).toEqual(["five_hour"]);
	expect(partial && canDeferClaudeHttpQuota(original, partial, now)).toBe(
		false,
	);
	for (const change of [
		{ observedAt: now + 1 },
		{ observedAt: now - 16 * 60_000 - 1 },
		{ resetsAt: now },
		{ usedPercent: Number.NaN },
		{ usedPercent: 101 },
	])
		expect(
			mergeNativeClaudeQuota(original, [reading("five_hour", change)], now),
		).toBeNull();
	for (const status of ["signed_out", "token_expired", "token_stale"] as const)
		expect(
			mergeNativeClaudeQuota(
				{ ...original, status },
				[reading("five_hour")],
				now,
			),
		).toBeNull();
});
test("provider/model windows and newer reset epochs keep their own original observations", () => {
	const scoped = {
		id: "seven_day_sonnet",
		label: "Weekly · Sonnet",
		usedPercent: 40,
		resetsAt: new Date(now + 500_000),
		observedAt: new Date(now - 20 * 60_000),
		source: "provider" as const,
	};
	const current = {
		id: "five_hour",
		label: "Session (5h)",
		usedPercent: 55,
		resetsAt: new Date(now + 120_000),
		observedAt: new Date(now),
		source: "provider" as const,
	};
	const original = {
		...base(),
		status: "ok" as const,
		windows: [current, scoped],
	};
	const merged = mergeNativeClaudeQuota(
		original,
		[reading("five_hour"), reading("seven_day")],
		now,
	);
	expect(merged?.windows.find((window) => window.id === "five_hour")).toBe(
		current,
	);
	expect(
		merged?.windows.find((window) => window.id === "seven_day_sonnet"),
	).toBe(scoped);
	expect(merged && canDeferClaudeHttpQuota(original, merged, now)).toBe(false);
});
test("native quota cannot extend financial reconciliation or wallet age", () => {
	const original = base();
	const merged = mergeNativeClaudeQuota(
		original,
		[reading("five_hour"), reading("seven_day")],
		now,
	);
	if (!merged) throw new Error("missing native sample");
	expect(
		canDeferClaudeHttpQuota(
			{ ...original, fetchedAt: new Date(now - 30 * 60_000) },
			merged,
			now,
		),
	).toBe(false);
	expect(
		canDeferClaudeHttpQuota(
			{
				...original,
				prepaidBalance: {
					...original.prepaidBalance,
					checkedAt: new Date(now - 30 * 60_000),
				},
			},
			merged,
			now,
		),
	).toBe(false);
	expect(
		canDeferClaudeHttpQuota(
			{ ...original, fetchedAt: new Date(now + 1) },
			merged,
			now,
		),
	).toBe(false);
});
test("cache-only scope lookup fences the captured token, cache object and registration generation", async () => {
	const original = base();
	let current = {
		accessToken: "fixture-token",
		canonicalProfile: "/fixture/profile",
		registrationHash: "e".repeat(64),
	};
	let cached = original;
	let enabled = true;
	let proof = true;
	let captured: unknown[] = [];
	const overlay = createNativeClaudeQuotaOverlay({
		enabled: () => enabled,
		readCurrent: async () => current,
		generation: (value) =>
			`generation:${value.accessToken}:${value.registrationHash}`,
		resolveScope: async (...args) => {
			captured = args;
			return proof ? "verified-scope" : null;
		},
		isCurrent: (_token, value) => cached === value,
		snapshot: () => [reading("five_hour")],
		now: () => now,
	});
	const credential = {
		accessToken: "fixture-token",
		selection: "/fixture/profile",
	};
	expect((await overlay(credential, original))?.windows).toHaveLength(1);
	expect(captured).toEqual([
		"/fixture/profile",
		"/fixture/profile",
		"e".repeat(64),
		`generation:fixture-token:${"e".repeat(64)}`,
	]);
	proof = false;
	expect(await overlay(credential, original)).toBeNull();
	proof = true;
	cached = { ...original };
	expect(await overlay(credential, original)).toBeNull();
	cached = original;
	current = { ...current, accessToken: "rotated" };
	expect(await overlay(credential, original)).toBeNull();
	enabled = false;
	expect(await overlay(credential, original)).toBeNull();
});
