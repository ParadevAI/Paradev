import { expect, test } from "bun:test";
import { createQuotaResetTracker } from "./quota-reset-tracker";
import type { UsageAccount } from "./types";

const boundary = Date.parse("2026-10-15T12:00:00Z");
function account(
	at: number,
	reset: number,
	used: number,
	patch: Partial<UsageAccount> = {},
): UsageAccount {
	return {
		agent: "claude",
		accountKey: "/synthetic/profile",
		sourceLabel: "Synthetic",
		credentialKind: "subscription",
		email: "synthetic@example.test",
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [
			{
				id: "five_hour",
				label: "Session",
				usedPercent: used,
				resetsAt: new Date(reset),
			},
		],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: false,
		fetchedAt: new Date(at),
		quotaIdentity: "verified-owner",
		...patch,
	};
}

test("a reset needs a crossed boundary and two distinct corroborating observations; claims are once only", () => {
	let now = boundary - 30_000;
	const tracker = createQuotaResetTracker(() => now);
	expect(
		tracker.observe([account(now, boundary, 80)])[0]?.resetNotice,
	).toBeUndefined();
	now = boundary + 1_000;
	const candidate = account(now, boundary + 18_000_000, 1);
	expect(tracker.observe([candidate])[0]?.resetNotice).toBeUndefined();
	now += 20_000;
	expect(tracker.observe([candidate])[0]?.resetNotice).toBeUndefined();
	const [confirmed] = tracker.observe([account(now, boundary + 18_000_000, 2)]);
	expect(confirmed?.resetNotice?.kind).toBe("session");
	const id = confirmed?.resetNotice?.id;
	if (!id) throw new Error("Expected a confirmed reset.");
	expect(tracker.claim([id, id])).toHaveLength(1);
	expect(tracker.claim([id])).toEqual([]);
	tracker.observe([account(now + 1_000, boundary + 18_000_000, 3)]);
	expect(tracker.claim([id])).toEqual([]);
});

test("a later session reset re-arms its own once-only claim", () => {
	let now = boundary - 30_000;
	const tracker = createQuotaResetTracker(() => now);
	tracker.observe([account(now, boundary, 80)]);
	now = boundary + 1_000;
	tracker.observe([account(now, boundary + 18_000_000, 1)]);
	now += 20_000;
	const first = tracker.observe([account(now, boundary + 18_000_000, 2)])[0]
		?.resetNotice;
	if (!first) throw new Error("Expected the first reset.");
	expect(tracker.claim([first.id])).toHaveLength(1);
	now = boundary + 18_000_000 - 30_000;
	tracker.observe([account(now, boundary + 18_000_000, 80)]);
	now = boundary + 18_000_000 + 1_000;
	tracker.observe([account(now, boundary + 36_000_000, 1)]);
	now += 20_000;
	const second = tracker.observe([account(now, boundary + 36_000_000, 2)])[0]
		?.resetNotice;
	if (!second) throw new Error("Expected the second reset.");
	expect(second.id).not.toBe(first.id);
	expect(tracker.claim([second.id])).toHaveLength(1);
	expect(tracker.claim([second.id])).toEqual([]);
});

test("identity/plan changes and missing identity cannot inherit a prior reset baseline", () => {
	for (const patch of [
		{ quotaIdentity: "other-owner" },
		{ plan: "other-plan" },
		{ quotaIdentity: undefined },
	]) {
		let now = boundary - 30_000;
		const tracker = createQuotaResetTracker(() => now);
		tracker.observe([account(now, boundary, 80)]);
		now = boundary + 1_000;
		tracker.observe([account(now, boundary + 18_000_000, 1, patch)]);
		now += 20_000;
		expect(
			tracker.observe([account(now, boundary + 18_000_000, 2, patch)])[0]
				?.resetNotice,
		).toBeUndefined();
	}
});

test("stale, model-scoped and unknown-duration observations cannot produce general reset notices", () => {
	let now = boundary - 30_000;
	const tracker = createQuotaResetTracker(() => now);
	tracker.observe([account(now, boundary, 80)]);
	now = boundary + 1_000;
	const scoped = {
		windows: [
			{
				id: "weekly_scoped:Sonnet",
				label: "Weekly · Sonnet",
				usedPercent: 1,
				resetsAt: new Date(boundary + 604_800_000),
			},
		],
	};
	tracker.observe([account(now, boundary + 18_000_000, 1, scoped)]);
	now += 20_000;
	expect(
		tracker.observe([account(now, boundary + 18_000_000, 2, scoped)])[0]
			?.resetNotice,
	).toBeUndefined();
	expect(
		tracker.observe([account(now - 7 * 60_000, boundary + 18_000_000, 2)])[0]
			?.resetNotice,
	).toBeUndefined();
	const codex = {
		agent: "codex" as const,
		windows: [
			{
				id: "primary",
				label: "Unknown",
				usedPercent: 1,
				resetsAt: new Date(boundary + 604_800_000),
			},
		],
	};
	expect(
		tracker.observe([account(now, boundary + 604_800_000, 1, codex)])[0]
			?.resetNotice,
	).toBeUndefined();
});
