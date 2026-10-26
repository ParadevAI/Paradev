import { expect, test } from "bun:test";
import { bindClaudeQuotaIdentity, copyQuotaIdentity } from "./quota-identity";
import type { UsageAccount } from "./types";
import { projectWidgetQuotaMetadata } from "./widget-quota-metadata";

const clock = Date.parse("2026-10-25T12:00:00Z");
const profile = {
	account: {
		uuid: "12345678-1234-1234-1234-123456789abc",
		email: "synthetic@example.test",
	},
	organization: { uuid: "87654321-4321-4321-4321-cba987654321" },
};
const base: UsageAccount = {
	agent: "claude",
	credentialKind: "subscription",
	accountKey: "/synthetic/profile",
	sourceLabel: "Synthetic",
	email: "synthetic@example.test",
	plan: "max",
	status: "ok",
	statusDetail: null,
	windows: [],
	creditsBalance: null,
	extraUsage: null,
	selection: "/synthetic/profile",
	isDefault: false,
	fetchedAt: new Date(clock),
};
test("transient quota failure preserves independently verified account color scope", () => {
	const good = bindClaudeQuotaIdentity(
		{ ...base },
		"synthetic-token",
		profile,
		clock,
	);
	const current = projectWidgetQuotaMetadata(good, clock);
	const failed = copyQuotaIdentity(good, {
		...good,
		status: "unavailable" as const,
		fetchedAt: new Date(clock + 60000),
	});
	expect(projectWidgetQuotaMetadata(failed, clock + 60000).quotaIdentity).toBe(
		current.quotaIdentity,
	);
	expect(current.quotaIdentity).toMatch(/^[a-f0-9]{64}$/);
	expect(
		projectWidgetQuotaMetadata(failed, clock + 6 * 60 * 60000 + 1)
			.quotaIdentity,
	).toBeUndefined();
});
test("sign-out, revoked proof, changed owner and unknown discovery cannot inherit color scope", () => {
	const good = bindClaudeQuotaIdentity(
		{ ...base },
		"synthetic-token",
		profile,
		clock,
	);
	const first = projectWidgetQuotaMetadata(good, clock);
	for (const status of ["signed_out", "token_expired"] as const)
		expect(
			projectWidgetQuotaMetadata(
				copyQuotaIdentity(good, { ...good, status }),
				clock,
			).quotaIdentity,
		).toBeUndefined();
	expect(
		projectWidgetQuotaMetadata(
			{ ...base, quotaIdentity: first.quotaIdentity },
			clock,
		).quotaIdentity,
	).toBeUndefined();
	const changed = bindClaudeQuotaIdentity(
		{ ...base },
		"new-token",
		{
			...profile,
			organization: { uuid: "00000000-0000-0000-0000-000000000001" },
		},
		clock,
	);
	expect(projectWidgetQuotaMetadata(changed, clock).quotaIdentity).not.toBe(
		first.quotaIdentity,
	);
	expect(
		projectWidgetQuotaMetadata(
			{ ...base, sourceId: first.sourceId, discoveryFailed: true },
			clock,
		).sourceId,
	).toBeUndefined();
});

test("Claude profile colors and source slots survive file/Keychain transport changes", () => {
	for (const selection of [null, "/synthetic/profile"]) {
		const file = bindClaudeQuotaIdentity(
			{
				...base,
				selection,
				accountKey: "/synthetic/profile/.credentials.json",
			},
			"file-token",
			profile,
			clock,
		);
		const keychain = bindClaudeQuotaIdentity(
			{ ...base, selection, accountKey: "keychain:Claude Code-credentials" },
			"rotated-token",
			profile,
			clock,
		);
		const first = projectWidgetQuotaMetadata(file, clock);
		const second = projectWidgetQuotaMetadata(keychain, clock);
		expect(second.quotaIdentity).toBe(first.quotaIdentity);
		expect(second.sourceId).toBe(first.sourceId);
		const failed = copyQuotaIdentity(keychain, {
			...keychain,
			status: "unavailable" as const,
		});
		expect(
			projectWidgetQuotaMetadata(failed, clock + 60_000).quotaIdentity,
		).toBe(first.quotaIdentity);
		const otherSlot = bindClaudeQuotaIdentity(
			{
				...base,
				selection: "/synthetic/other",
				accountKey: keychain.accountKey,
			},
			"rotated-token",
			profile,
			clock,
		);
		expect(projectWidgetQuotaMetadata(otherSlot, clock).quotaIdentity).not.toBe(
			first.quotaIdentity,
		);
		expect(projectWidgetQuotaMetadata(otherSlot, clock).sourceId).not.toBe(
			first.sourceId,
		);
	}
});

test("a stable profile slot never carries a prior owner's identity into another organization", () => {
	const first = projectWidgetQuotaMetadata(
		bindClaudeQuotaIdentity({ ...base }, "old-token", profile, clock),
		clock,
	);
	const changed = projectWidgetQuotaMetadata(
		bindClaudeQuotaIdentity(
			{ ...base, accountKey: "keychain:other" },
			"new-token",
			{
				...profile,
				organization: { uuid: "00000000-0000-0000-0000-000000000002" },
			},
			clock,
		),
		clock,
	);
	expect(changed.sourceId).toBe(first.sourceId);
	expect(changed.quotaIdentity).not.toBe(first.quotaIdentity);
});
