import { App } from "@octokit/app";
import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubRepositories,
	githubUserConnections,
	userIdentities,
} from "@superset/db/schema";
import { accounts, members } from "@superset/db/schema/auth";
import { Client } from "@upstash/qstash";
import { and, asc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { installationOctokit } from "../../../lib/sandbox/clone-token";
import { open, seal } from "../../../lib/secret-box";
import { organizationSyncsNow } from "../../../lib/sync-policy/syncPolicy";

const INSTALL_STATE_AAD = "github-app-install";
const INSTALL_STATE_TTL_MS = 10 * 60_000;
const DISCOVERY_COOLDOWN_MS = 5 * 60_000;

const discoveryLastAttemptByKey = new Map<string, number>();

const installStateSchema = z.object({
	organizationId: z.string().uuid(),
	userId: z.string().uuid(),
	expiresAt: z.number(),
});

export function sealGithubAppInstallState(args: {
	organizationId: string;
	userId: string;
	expiresAt?: number;
}): string {
	const sealed = seal(
		JSON.stringify({
			organizationId: args.organizationId,
			userId: args.userId,
			expiresAt: args.expiresAt ?? Date.now() + INSTALL_STATE_TTL_MS,
		}),
		INSTALL_STATE_AAD,
	);
	return Buffer.from(sealed, "base64").toString("base64url");
}

export function githubAppInstallUrl(args: {
	organizationId: string;
	userId: string;
}): string | null {
	if (!env.GH_APP_SLUG) return null;
	try {
		const state = sealGithubAppInstallState(args);
		const url = new URL(
			`https://github.com/apps/${env.GH_APP_SLUG}/installations/new`,
		);
		url.searchParams.set("state", state);
		return url.toString();
	} catch {
		return null;
	}
}

export function readGithubAppInstallState(
	state: string,
): { organizationId: string; userId: string } | null {
	try {
		const base64 = Buffer.from(state, "base64url").toString("base64");
		const parsed = installStateSchema.parse(
			JSON.parse(open(base64, INSTALL_STATE_AAD)),
		);
		if (parsed.expiresAt < Date.now()) return null;
		return {
			organizationId: parsed.organizationId,
			userId: parsed.userId,
		};
	} catch {
		return null;
	}
}

function githubAppClient(): App | null {
	if (
		!env.GH_APP_ID ||
		!env.GH_APP_PRIVATE_KEY ||
		!env.GH_APP_PRIVATE_KEY.includes("-----BEGIN")
	) {
		return null;
	}
	return new App({
		appId: env.GH_APP_ID,
		privateKey: env.GH_APP_PRIVATE_KEY,
	});
}

/**
 * Verifies that `githubAccountId` (GitHub's numeric user ID) belongs to
 * `userId` in Superset via `github_user_connections`, Better Auth `accounts`,
 * or `user_identities`.
 */
export async function doesGithubAccountBelongToUser(args: {
	userId: string;
	githubAccountId: string;
}): Promise<boolean> {
	const [connection, authAccount, identity] = await Promise.all([
		db.query.githubUserConnections.findFirst({
			where: and(
				eq(githubUserConnections.userId, args.userId),
				eq(githubUserConnections.githubUserId, args.githubAccountId),
			),
			columns: { id: true },
		}),
		db.query.accounts.findFirst({
			where: and(
				eq(accounts.userId, args.userId),
				eq(accounts.providerId, "github"),
				eq(accounts.accountId, args.githubAccountId),
			),
			columns: { id: true },
		}),
		db.query.userIdentities.findFirst({
			where: and(
				eq(userIdentities.userId, args.userId),
				eq(userIdentities.provider, "github"),
				eq(userIdentities.externalId, args.githubAccountId),
			),
			columns: { id: true },
		}),
	]);
	return Boolean(connection || authAccount || identity);
}

export async function syncInstallationRepositories(args: {
	installationDbId: string;
	githubInstallationId: string;
	organizationId: string;
}): Promise<number> {
	const octokit = await installationOctokit(args.githubInstallationId);
	const repos: Array<{
		id: number | bigint;
		name: string;
		full_name: string;
		default_branch?: string;
		private: boolean;
		owner: { login: string };
	}> = [];
	const perPage = 100;
	for (let page = 1; ; page++) {
		const { data } = await octokit.request("GET /installation/repositories", {
			per_page: perPage,
			page,
		});
		repos.push(...data.repositories);
		if (data.repositories.length < perPage) break;
	}

	for (const repo of repos) {
		const repoId = String(repo.id);
		await db
			.insert(githubRepositories)
			.values({
				installationId: args.installationDbId,
				organizationId: args.organizationId,
				repoId,
				owner: repo.owner.login,
				name: repo.name,
				fullName: repo.full_name,
				defaultBranch: repo.default_branch ?? "main",
				isPrivate: repo.private,
			})
			.onConflictDoUpdate({
				target: [githubRepositories.repoId],
				set: {
					installationId: args.installationDbId,
					organizationId: args.organizationId,
					owner: repo.owner.login,
					name: repo.name,
					fullName: repo.full_name,
					defaultBranch: repo.default_branch ?? "main",
					isPrivate: repo.private,
					updatedAt: new Date(),
				},
			});
	}

	await db
		.update(githubInstallations)
		.set({ lastSyncedAt: new Date() })
		.where(eq(githubInstallations.id, args.installationDbId));

	return repos.length;
}

async function queueInitialSyncJob(args: {
	installationDbId: string;
	organizationId: string;
}): Promise<void> {
	const syncUrl = `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`;
	const syncBody = {
		installationDbId: args.installationDbId,
		organizationId: args.organizationId,
	};
	if (env.NODE_ENV === "development") {
		fetch(syncUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(syncBody),
		}).catch(() => {});
		return;
	}
	const qstash = new Client({ token: env.QSTASH_TOKEN });
	await qstash
		.publishJSON({
			url: syncUrl,
			body: syncBody,
			retries: 3,
		})
		.catch(() => {});
}

async function liftBotSuspensionIfNeeded(
	app: App,
	installation: {
		id: string;
		installationId: string;
		suspended: boolean;
	},
): Promise<boolean> {
	const installationId = Number(installation.installationId);
	const { data: remote } = await app.octokit.request(
		"GET /app/installations/{installation_id}",
		{ installation_id: installationId },
	);
	if (!remote.suspended_at) {
		if (installation.suspended) {
			await db
				.update(githubInstallations)
				.set({ suspended: false, suspendedAt: null })
				.where(eq(githubInstallations.id, installation.id));
			return true;
		}
		return false;
	}
	if (remote.suspended_by?.type !== "Bot") return false;
	await app.octokit.request(
		"DELETE /app/installations/{installation_id}/suspended",
		{ installation_id: installationId },
	);
	await db
		.update(githubInstallations)
		.set({ suspended: false, suspendedAt: null })
		.where(eq(githubInstallations.id, installation.id));
	return true;
}

async function isSoloOrganization(organizationId: string): Promise<boolean> {
	const rows = await db
		.select({ id: members.id })
		.from(members)
		.where(eq(members.organizationId, organizationId))
		.limit(2);
	return rows.length <= 1;
}

/**
 * Ensures a user's personal ("User") GitHub App installation is linked,
 * unsuspended when their active organization syncs, and has its repositories
 * populated in `github_repositories`.
 */
export async function syncPersonalGithubInstallation(args: {
	organizationId: string;
	userId: string;
	force?: boolean;
}) {
	let existing = await db.query.githubInstallations.findFirst({
		where: and(
			eq(githubInstallations.connectedByUserId, args.userId),
			eq(githubInstallations.accountType, "User"),
		),
	});

	if (
		existing &&
		existing.lastSyncedAt !== null &&
		!existing.suspended &&
		!args.force
	) {
		return existing;
	}

	const cooldownKey = `${args.userId}:${args.organizationId}`;
	if (!args.force && !existing) {
		const lastAttempt = discoveryLastAttemptByKey.get(cooldownKey) ?? 0;
		if (Date.now() - lastAttempt < DISCOVERY_COOLDOWN_MS) {
			return null;
		}
		discoveryLastAttemptByKey.set(cooldownKey, Date.now());
	}

	const app = githubAppClient();
	let newlyDiscovered = false;

	if (!existing && app) {
		const connection = await db.query.githubUserConnections.findFirst({
			where: eq(githubUserConnections.userId, args.userId),
			columns: { login: true, githubUserId: true },
		});
		if (connection?.login && connection.githubUserId) {
			const remote = await app.octokit
				.request("GET /users/{username}/installation", {
					username: connection.login,
				})
				.then((res) => res.data)
				.catch(() => null);
			const remoteAccountId =
				remote?.account && "id" in remote.account
					? String(remote.account.id)
					: null;
			if (remote && remoteAccountId === connection.githubUserId) {
				const account = remote.account;
				const accountLogin =
					account && "login" in account ? account.login : connection.login;
				const [conflict] = await db
					.select()
					.from(githubInstallations)
					.where(eq(githubInstallations.installationId, String(remote.id)))
					.limit(1);
				if (!conflict) {
					const [inserted] = await db
						.insert(githubInstallations)
						.values({
							organizationId: args.organizationId,
							connectedByUserId: args.userId,
							installationId: String(remote.id),
							accountLogin,
							accountType: "User",
							permissions: remote.permissions as Record<string, string>,
							suspended: Boolean(remote.suspended_at),
							suspendedAt: remote.suspended_at
								? new Date(remote.suspended_at)
								: null,
						})
						.onConflictDoNothing()
						.returning();
					if (inserted) {
						existing = inserted;
						newlyDiscovered = true;
					}
				} else if (conflict.connectedByUserId === args.userId) {
					existing = conflict;
				}
			}
		}
	}

	if (!existing) return null;

	const activeOrgSyncs = await organizationSyncsNow(args.organizationId);
	let targetOrganizationId = existing.organizationId;
	let rehomed = false;

	if (
		activeOrgSyncs &&
		existing.organizationId !== args.organizationId &&
		!(await organizationSyncsNow(existing.organizationId)) &&
		(await isSoloOrganization(existing.organizationId))
	) {
		targetOrganizationId = args.organizationId;
		rehomed = true;
		await db
			.update(githubInstallations)
			.set({ organizationId: targetOrganizationId })
			.where(eq(githubInstallations.id, existing.id));
		await db
			.update(githubRepositories)
			.set({ organizationId: targetOrganizationId })
			.where(eq(githubRepositories.installationId, existing.id));
	}

	let unsuspended = false;
	if (app && activeOrgSyncs && (existing.suspended || args.force)) {
		unsuspended = await liftBotSuspensionIfNeeded(app, existing).catch(
			() => false,
		);
	}

	const needsSync =
		activeOrgSyncs &&
		Boolean(app) &&
		(args.force ||
			newlyDiscovered ||
			rehomed ||
			unsuspended ||
			existing.lastSyncedAt === null);

	if (needsSync) {
		await syncInstallationRepositories({
			installationDbId: existing.id,
			githubInstallationId: existing.installationId,
			organizationId: targetOrganizationId,
		});
		if (newlyDiscovered || unsuspended) {
			await queueInitialSyncJob({
				installationDbId: existing.id,
				organizationId: targetOrganizationId,
			});
		}
	}

	return existing;
}

/**
 * Filter pure installation rows for `organizationId` and optional `userId`:
 * - Any non-"User" installation in `organizationId` is shared by the organization.
 * - If `organizationId` has NO non-"User" installation, its oldest "User"
 *   installation is treated as the organization's shared legacy installation.
 * - A caller with `userId` also sees their own personal ("User") installation
 *   from any organization.
 */
export function selectVisibleInstallations<
	T extends {
		id: string;
		organizationId: string;
		accountType: string;
		connectedByUserId: string;
	},
>(rows: readonly T[], args: { organizationId: string; userId?: string }): T[] {
	const inOrg = rows.filter(
		(row) => row.organizationId === args.organizationId,
	);
	const orgNonUser = inOrg.filter((row) => row.accountType !== "User");
	const sharedIds = new Set<string>(
		(orgNonUser.length > 0 ? orgNonUser : inOrg.slice(0, 1)).map(
			(row) => row.id,
		),
	);
	return rows.filter(
		(row) =>
			sharedIds.has(row.id) ||
			(Boolean(args.userId) &&
				row.accountType === "User" &&
				row.connectedByUserId === args.userId),
	);
}

/**
 * Installations whose repositories should be visible to `userId` in
 * `organizationId`.
 */
export async function visibleGithubInstallations(args: {
	organizationId: string;
	userId?: string;
}) {
	const rows = await db.query.githubInstallations.findMany({
		where: args.userId
			? or(
					eq(githubInstallations.organizationId, args.organizationId),
					and(
						eq(githubInstallations.accountType, "User"),
						eq(githubInstallations.connectedByUserId, args.userId),
					),
				)
			: eq(githubInstallations.organizationId, args.organizationId),
		orderBy: [asc(githubInstallations.createdAt), asc(githubInstallations.id)],
	});

	return selectVisibleInstallations(rows, args);
}

/**
 * The primary installation for an organization, plus the caller's own personal
 * installation when present.
 */
export async function findOrganizationInstallations(args: {
	organizationId: string;
	userId?: string;
}) {
	const rows = await visibleGithubInstallations(args);
	const inOrg = rows.filter(
		(row) => row.organizationId === args.organizationId,
	);
	const organizationInstallation =
		inOrg.find((row) => row.accountType !== "User") ?? inOrg[0] ?? null;
	const personalInstallation = args.userId
		? (rows.find(
				(row) =>
					row.accountType === "User" && row.connectedByUserId === args.userId,
			) ?? null)
		: null;
	const primary = organizationInstallation ?? personalInstallation;
	return { primary, organizationInstallation, personalInstallation };
}

export function isRepositoryVisibleToUser(args: {
	repository: { organizationId: string };
	installation: {
		id?: string;
		accountType: string;
		connectedByUserId: string;
	};
	organizationId: string;
	userId?: string;
	/** True when this "User" installation is the organization's sole (legacy) installation. */
	isLegacySharedUserInstallation?: boolean;
}): boolean {
	if (
		args.installation.accountType !== "User" ||
		args.isLegacySharedUserInstallation
	) {
		return args.repository.organizationId === args.organizationId;
	}
	if (args.userId) {
		return args.installation.connectedByUserId === args.userId;
	}
	return args.repository.organizationId === args.organizationId;
}
