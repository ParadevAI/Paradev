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

test("same verified profile-owner retains reset lineage across credential transport changes", () => {
	let now = boundary - 30_000;
	const tracker = createQuotaResetTracker(() => now);
	tracker.observe([
		account(now, boundary, 80, {
			accountKey: "/synthetic/profile/.credentials.json",
		}),
	]);
	now = boundary + 1_000;
	tracker.observe([
		account(now, boundary + 18_000_000, 1, {
			accountKey: "keychain:Claude Code-credentials",
		}),
	]);
	now += 20_000;
	const notice = tracker.observe([
		account(now, boundary + 18_000_000, 2, {
			accountKey: "/synthetic/profile/.credentials.json",
		}),
	])[0]?.resetNotice;
	expect(notice?.kind).toBe("session");
	if (!notice)
		throw new Error("Expected a transport-independent reset notice.");
	expect(tracker.claim([notice.id])).toHaveLength(1);
	tracker.observe([
		account(now + 1_000, boundary + 18_000_000, 3, {
			accountKey: "keychain:Claude Code-credentials",
		}),
	]);
	expect(tracker.claim([notice.id])).toEqual([]);
});

test("fresh native observations corroborate resets without renewing the outer provider date", () => {
	for (const fetchedAt of [
		new Date(boundary - 2 * 60 * 60_000),
		new Date(NaN),
	]) {
		let now = boundary - 30_000;
		const tracker = createQuotaResetTracker(() => now);
		const native = (
			reset: number,
			used: number,
			observedAt = now,
		): UsageAccount =>
			account(now, reset, used, {
				fetchedAt,
				windows: [
					{
						id: "five_hour",
						label: "Session",
						usedPercent: used,
						resetsAt: new Date(reset),
						source: "claude_statusline",
						observedAt: new Date(observedAt),
					},
				],
			});
		tracker.observe([native(boundary, 80)]);
		now = boundary + 1_000;
		tracker.observe([native(boundary + 18_000_000, 1)]);
		now += 20_000;
		const reading = native(boundary + 18_000_000, 2);
		expect(tracker.observe([reading])[0]?.resetNotice?.kind).toBe("session");
		expect(reading.fetchedAt).toBe(fetchedAt);
	}
});

test("a native sibling does not renew stale provider evidence or invalid native timestamps", () => {
	for (const measured of [boundary - 7 * 60_000, boundary + 60_000, NaN]) {
		let now = boundary - 30_000;
		const tracker = createQuotaResetTracker(() => now);
		tracker.observe([account(now, boundary, 80)]);
		now = boundary + 1_000;
		const stale = (used: number): UsageAccount =>
			account(now, boundary + 18_000_000, used, {
				windows: [
					{
						id: "five_hour",
						label: "Session",
						usedPercent: used,
						resetsAt: new Date(boundary + 18_000_000),
						observedAt: new Date(measured),
						source: "claude_statusline",
					},
					{
						id: "weekly_scoped:Sonnet",
						label: "Model",
						usedPercent: 0,
						resetsAt: new Date(boundary + 604_800_000),
						observedAt: new Date(now),
						source: "claude_statusline",
					},
				],
			});
		tracker.observe([stale(1)]);
		now += 20_000;
		expect(tracker.observe([stale(2)])[0]?.resetNotice).toBeUndefined();
	}
});
