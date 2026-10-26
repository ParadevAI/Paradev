import { expect, test } from "bun:test";
import {
	allUsageWindowsCurrent,
	hasCurrentUsage,
	isFresh,
	type WidgetAccount,
	widgetUsageReading,
} from "./model";

const now = Date.parse("2026-10-25T12:00:00Z");
const dated = new Date(now - 25 * 60_000).toISOString();
function account(patch: Partial<WidgetAccount> = {}): WidgetAccount {
	return {
		id: `claude:${"a".repeat(64)}`,
		quotaIdentity: "a".repeat(64),
		provider: "claude",
		label: "Fixture",
		email: null,
		plan: "Max",
		isDefault: false,
		status: "ok",
		identityChanged: false,
		billing: "subscription",
		historical: false,
		checkedAt: dated,
		windows: ["five_hour", "seven_day"].map((id) => ({
			id,
			label: id,
			usedPercent: 12,
			resetsAt: new Date(now + 60_000).toISOString(),
			observedAt: new Date(now - 1_000).toISOString(),
			source: "claude_statusline",
		})),
		...patch,
	};
}

test("current native windows stay live without retiming the provider, wallet or resets", () => {
	const value = account({
		prepaidBalance: { amount: 3.25, currency: "USD", checkedAt: dated },
		resetCredits: { availableCount: 2, expirations: null, checkedAt: dated },
	});
	const original = structuredClone(value);
	expect(isFresh(value, false, now)).toBe(false);
	expect(hasCurrentUsage(value, false, now)).toBe(true);
	expect(allUsageWindowsCurrent(value, false, now)).toBe(true);
	expect(widgetUsageReading(value, false, now).checkedAt?.toISOString()).toBe(
		dated,
	);
	expect(value).toEqual(original);
});

test("one current native window permits a current account but not an all-live summary", () => {
	const value = account();
	value.windows = value.windows.map((window, index) =>
		index === 1
			? { ...window, source: "provider" as const, observedAt: dated }
			: window,
	);
	expect(hasCurrentUsage(value, false, now)).toBe(true);
	expect(allUsageWindowsCurrent(value, false, now)).toBe(false);
	expect(isFresh(value, false, now)).toBe(false);
});

test("provider-only weekly plans keep their actual window current through the polling interval", () => {
	const value = account({
		checkedAt: new Date(now - 15 * 60_000).toISOString(),
		windows: [
			{
				id: "weekly",
				label: "Weekly",
				usedPercent: 50,
				resetsAt: null,
				source: "provider",
			},
		],
	});
	expect(hasCurrentUsage(value, false, now)).toBe(true);
	expect(allUsageWindowsCurrent(value, false, now)).toBe(true);
});

test.each([
	{ historical: true },
	{ identityChanged: true },
	{ status: "unavailable" as const },
	{ status: "signed_out" as const },
	{ status: "token_expired" as const },
])("history and unverified accounts cannot become live from native timestamps: %j", (patch) => {
	const value = account(patch);
	expect(hasCurrentUsage(value, false, now)).toBe(false);
	expect(allUsageWindowsCurrent(value, false, now)).toBe(false);
});

test("offline windows cannot enable live appearance edits", () => {
	expect(hasCurrentUsage(account(), true, now)).toBe(false);
	expect(allUsageWindowsCurrent(account(), true, now)).toBe(false);
});

test("empty windows do not make an all-live claim", () => {
	const value = account({
		checkedAt: new Date(now).toISOString(),
		windows: [],
	});
	expect(isFresh(value, false, now)).toBe(true);
	expect(hasCurrentUsage(value, false, now)).toBe(false);
	expect(allUsageWindowsCurrent(value, false, now)).toBe(false);
});

test.each([
	new Date(now - 6 * 60_000 - 1).toISOString(),
	new Date(now + 60_001).toISOString(),
	"invalid",
])("stale or invalid native observations do not enable live state: %s", (observedAt) => {
	const value = account();
	value.windows = value.windows.map((window) => ({ ...window, observedAt }));
	expect(hasCurrentUsage(value, false, now)).toBe(false);
	expect(allUsageWindowsCurrent(value, false, now)).toBe(false);
});

test("native windows whose reset passed await confirmation", () => {
	const value = account();
	value.windows = value.windows.map((window) => ({
		...window,
		resetsAt: new Date(now - 1).toISOString(),
	}));
	expect(hasCurrentUsage(value, false, now)).toBe(false);
	expect(allUsageWindowsCurrent(value, false, now)).toBe(false);
});
