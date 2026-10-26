import { describe, expect, test } from "bun:test";
import { setTestEnv } from "../../../../test/env";
import {
	isRepositoryVisibleToUser,
	readGithubAppInstallState,
	sealGithubAppInstallState,
	selectVisibleInstallations,
} from "./personal-installation";

setTestEnv({
	SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
});

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER_ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("isRepositoryVisibleToUser", () => {
	test("allows an organization installation repository in its own organization", () => {
		expect(
			isRepositoryVisibleToUser({
				repository: { organizationId: ORG_A },
				installation: {
					accountType: "Organization",
					connectedByUserId: USER_ALICE,
				},
				organizationId: ORG_A,
				userId: USER_BOB,
			}),
		).toBe(true);
	});

	test("refuses an organization installation repository from another organization", () => {
		expect(
			isRepositoryVisibleToUser({
				repository: { organizationId: ORG_A },
				installation: {
					accountType: "Organization",
					connectedByUserId: USER_ALICE,
				},
				organizationId: ORG_B,
				userId: USER_ALICE,
			}),
		).toBe(false);
	});

	test("allows a personal User installation repository to its owner in any organization", () => {
		expect(
			isRepositoryVisibleToUser({
				repository: { organizationId: ORG_A },
				installation: {
					accountType: "User",
					connectedByUserId: USER_ALICE,
				},
				organizationId: ORG_B,
				userId: USER_ALICE,
			}),
		).toBe(true);
	});

	test("hides a personal User installation repository from other members of the organization", () => {
		expect(
			isRepositoryVisibleToUser({
				repository: { organizationId: ORG_A },
				installation: {
					accountType: "User",
					connectedByUserId: USER_ALICE,
				},
				organizationId: ORG_A,
				userId: USER_BOB,
			}),
		).toBe(false);
	});

	test("allows a legacy shared User installation repository to all members of its organization", () => {
		expect(
			isRepositoryVisibleToUser({
				repository: { organizationId: ORG_A },
				installation: {
					id: "inst-legacy",
					accountType: "User",
					connectedByUserId: USER_ALICE,
				},
				organizationId: ORG_A,
				userId: USER_BOB,
				isLegacySharedUserInstallation: true,
			}),
		).toBe(true);
	});
});

describe("selectVisibleInstallations", () => {
	const rows = [
		{
			id: "inst-org",
			organizationId: ORG_A,
			accountType: "Organization",
			connectedByUserId: USER_ALICE,
		},
		{
			id: "inst-alice",
			organizationId: ORG_B,
			accountType: "User",
			connectedByUserId: USER_ALICE,
		},
		{
			id: "inst-bob",
			organizationId: ORG_A,
			accountType: "User",
			connectedByUserId: USER_BOB,
		},
	];

	test("returns the organization installation and only the caller's personal installation", () => {
		expect(
			selectVisibleInstallations(rows, {
				organizationId: ORG_A,
				userId: USER_ALICE,
			}).map((r) => r.id),
		).toEqual(["inst-org", "inst-alice"]);

		expect(
			selectVisibleInstallations(rows, {
				organizationId: ORG_A,
				userId: USER_BOB,
			}).map((r) => r.id),
		).toEqual(["inst-org", "inst-bob"]);
	});

	test("keeps a legacy User installation shared when the organization has no Organization installation", () => {
		const legacyRows = [
			{
				id: "inst-legacy-user",
				organizationId: ORG_A,
				accountType: "User",
				connectedByUserId: USER_ALICE,
			},
		];
		expect(
			selectVisibleInstallations(legacyRows, {
				organizationId: ORG_A,
				userId: USER_BOB,
			}).map((r) => r.id),
		).toEqual(["inst-legacy-user"]);
	});
});

describe("sealGithubAppInstallState and readGithubAppInstallState", () => {
	test("round-trips a base64url-encoded state", () => {
		const state = sealGithubAppInstallState({
			organizationId: ORG_A,
			userId: USER_ALICE,
		});
		expect(state).not.toMatch(/[+/=]/);
		expect(readGithubAppInstallState(state)).toEqual({
			organizationId: ORG_A,
			userId: USER_ALICE,
		});
	});

	test("rejects an expired state", () => {
		const expired = sealGithubAppInstallState({
			organizationId: ORG_A,
			userId: USER_ALICE,
			expiresAt: Date.now() - 1_000,
		});
		expect(readGithubAppInstallState(expired)).toBeNull();
	});

	test("returns null for a tampered or invalid state string", () => {
		const valid = sealGithubAppInstallState({
			organizationId: ORG_A,
			userId: USER_ALICE,
		});
		expect(readGithubAppInstallState(`${valid}tampered`)).toBeNull();
		expect(readGithubAppInstallState("invalid-state")).toBeNull();
	});
});
