import { db } from "@superset/db/client";
import { githubInstallations, githubRepositories } from "@superset/db/schema";
import { members } from "@superset/db/schema/auth";
import {
	doesGithubAccountBelongToUser,
	readGithubAppInstallState,
	syncInstallationRepositories,
} from "@superset/trpc/lib/github-user";
import { organizationSyncsNow } from "@superset/trpc/sync-policy";
import { Client } from "@upstash/qstash";
import { and, eq, ne } from "drizzle-orm";
import { env } from "@/env";
import { exitOAuthFlow, STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { githubApp } from "../octokit";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/github`;

function desktopPage(title: string, detail: string, status: number): Response {
	const escapeHtml = (text: string) =>
		text.replace(
			/[&<>"]/g,
			(char) =>
				({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ??
				char,
		);
	return new Response(
		`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><body style="font:15px -apple-system,system-ui,sans-serif;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:0 16px"><main style="max-width:32rem"><h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(title)}</h1><p style="color:#aaa;margin:0">${escapeHtml(detail)}</p></main>`,
		{ status, headers: { "content-type": "text/html; charset=utf-8" } },
	);
}

/**
 * Callback handler for GitHub App installation.
 * GitHub redirects here after the user installs/configures the app.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const rawState = url.searchParams.get("state");
	const desktopState = rawState ? readGithubAppInstallState(rawState) : null;

	const hasWebCookie = Boolean(
		request.headers.get("cookie")?.includes(`${STATE_COOKIES.github}=`),
	);

	if (url.searchParams.get("setup_action") === "cancel") {
		if (desktopState || !hasWebCookie) {
			return desktopPage(
				"GitHub was not connected",
				"You cancelled on GitHub.",
				400,
			);
		}
		return exitOAuthFlow(
			STATE_COOKIES.github,
			`${settingsUrl}?error=installation_cancelled`,
		);
	}

	if (!desktopState && !hasWebCookie) {
		return desktopPage(
			"GitHub was not connected",
			"The link expired; open it again from Superset.",
			400,
		);
	}

	let organizationId: string;
	let userId: string;
	let installationId: string;
	let exit: (redirectUrl: string) => Response;
	const fromDesktop = desktopState !== null;

	if (desktopState) {
		const installationParam = url.searchParams.get("installation_id");
		if (!installationParam) {
			return desktopPage(
				"GitHub was not connected",
				"The link was incomplete.",
				400,
			);
		}
		const membership = await db.query.members.findFirst({
			where: and(
				eq(members.organizationId, desktopState.organizationId),
				eq(members.userId, desktopState.userId),
			),
			columns: { id: true },
		});
		if (!membership) {
			return desktopPage(
				"GitHub was not connected",
				"You are not a member of this organization.",
				403,
			);
		}
		if (!(await organizationSyncsNow(desktopState.organizationId))) {
			return desktopPage(
				"GitHub was not connected",
				"GitHub sync requires the Pro plan.",
				403,
			);
		}
		organizationId = desktopState.organizationId;
		userId = desktopState.userId;
		installationId = installationParam;
		exit = (redirectUrl: string) => {
			const error = new URL(redirectUrl).searchParams.get("error");
			return desktopPage(
				"GitHub was not connected",
				error === "already_connected"
					? "This GitHub installation is already connected to another account."
					: "Something went wrong; try again from Superset.",
				400,
			);
		};
	} else {
		const callback = await resolveCallback(request, {
			params: ["installation_id"],
			redirect: (error) => `${settingsUrl}?error=${error}`,
			cookie: STATE_COOKIES.github,
		});
		if (callback instanceof Response) return callback;
		organizationId = callback.organizationId;
		userId = callback.userId;
		installationId = callback.params.installation_id;
		exit = callback.exit;
	}

	try {
		const octokit = await githubApp.getInstallationOctokit(
			Number(installationId),
		);

		const installationResult = await octokit
			.request("GET /app/installations/{installation_id}", {
				installation_id: Number(installationId),
			})
			.catch((error: Error) => {
				console.error("[github/callback] Failed to fetch installation:", error);
				return null;
			});

		if (!installationResult) {
			return exit(`${settingsUrl}?error=installation_fetch_failed`);
		}

		const installation = installationResult.data;

		// Extract account info - account can be User or Enterprise
		const account = installation.account;
		const accountLogin =
			account && "login" in account ? account.login : (account?.name ?? "");
		const accountType =
			account && "type" in account ? account.type : "Organization";
		const accountId = account && "id" in account ? String(account.id) : null;
		const permissions = installation.permissions as Record<string, string>;

		const existingByInstallationId =
			await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.installationId, String(installation.id)),
			});

		let savedInstallation: typeof githubInstallations.$inferSelect | undefined;

		if (accountType === "User") {
			if (fromDesktop) {
				const verifiedOwner =
					accountId !== null &&
					(await doesGithubAccountBelongToUser({
						userId,
						githubAccountId: accountId,
					}));
				if (!verifiedOwner) {
					return desktopPage(
						"GitHub was not connected",
						"Connect your GitHub account in Settings → Connections first so Superset can verify this account is yours.",
						403,
					);
				}
			}

			if (
				existingByInstallationId &&
				existingByInstallationId.connectedByUserId !== userId
			) {
				return exit(`${settingsUrl}?error=already_connected`);
			}

			const existingUserInstallation =
				existingByInstallationId ??
				(await db.query.githubInstallations.findFirst({
					where: and(
						eq(githubInstallations.connectedByUserId, userId),
						eq(githubInstallations.accountType, "User"),
					),
				}));

			if (existingUserInstallation) {
				let shouldRehome = false;
				if (existingUserInstallation.organizationId !== organizationId) {
					const oldOrgMembers = await db
						.select({ id: members.id })
						.from(members)
						.where(
							eq(
								members.organizationId,
								existingUserInstallation.organizationId,
							),
						)
						.limit(2);
					shouldRehome =
						oldOrgMembers.length <= 1 &&
						(await organizationSyncsNow(organizationId)) &&
						!(await organizationSyncsNow(
							existingUserInstallation.organizationId,
						));
				}
				const targetOrgId = shouldRehome
					? organizationId
					: existingUserInstallation.organizationId;
				const [updated] = await db
					.update(githubInstallations)
					.set({
						organizationId: targetOrgId,
						connectedByUserId: userId,
						installationId: String(installation.id),
						accountLogin,
						accountType: "User",
						permissions,
						suspended: false,
						suspendedAt: null,
						updatedAt: new Date(),
					})
					.where(eq(githubInstallations.id, existingUserInstallation.id))
					.returning();
				savedInstallation = updated;
				if (shouldRehome) {
					await db
						.update(githubRepositories)
						.set({ organizationId: targetOrgId })
						.where(
							eq(
								githubRepositories.installationId,
								existingUserInstallation.id,
							),
						);
				}
			} else {
				const [inserted] = await db
					.insert(githubInstallations)
					.values({
						organizationId,
						connectedByUserId: userId,
						installationId: String(installation.id),
						accountLogin,
						accountType: "User",
						permissions,
					})
					.onConflictDoUpdate({
						target: [githubInstallations.installationId],
						set: {
							accountLogin,
							permissions,
							suspended: false,
							suspendedAt: null,
							updatedAt: new Date(),
						},
					})
					.returning();
				savedInstallation = inserted;
			}
		} else {
			if (
				fromDesktop &&
				(!existingByInstallationId ||
					existingByInstallationId.organizationId !== organizationId)
			) {
				return desktopPage(
					"GitHub was not connected",
					"Organization installations must be connected from Settings → Integrations.",
					403,
				);
			}

			if (
				existingByInstallationId &&
				existingByInstallationId.organizationId !== organizationId
			) {
				return exit(`${settingsUrl}?error=already_connected`);
			}

			const existingOrgInstallation =
				existingByInstallationId ??
				(await db.query.githubInstallations.findFirst({
					where: and(
						eq(githubInstallations.organizationId, organizationId),
						ne(githubInstallations.accountType, "User"),
					),
				}));

			if (existingOrgInstallation) {
				const [updated] = await db
					.update(githubInstallations)
					.set({
						...(fromDesktop ? {} : { connectedByUserId: userId }),
						installationId: String(installation.id),
						accountLogin,
						accountType,
						permissions,
						suspended: false,
						suspendedAt: null,
						updatedAt: new Date(),
					})
					.where(eq(githubInstallations.id, existingOrgInstallation.id))
					.returning();
				savedInstallation = updated;
			} else {
				const [inserted] = await db
					.insert(githubInstallations)
					.values({
						organizationId,
						connectedByUserId: userId,
						installationId: String(installation.id),
						accountLogin,
						accountType,
						permissions,
					})
					.onConflictDoUpdate({
						target: [githubInstallations.installationId],
						set: {
							accountLogin,
							permissions,
							suspended: false,
							suspendedAt: null,
							updatedAt: new Date(),
						},
					})
					.returning();
				savedInstallation = inserted;
			}
		}

		if (!savedInstallation) {
			return exit(`${settingsUrl}?error=save_failed`);
		}

		// Queue initial sync job. In development the queue cannot reach
		// localhost, so the job endpoint is called directly, as triggerSync does.
		// A free organization gets no backfill and no webhook sync after it
		// either; the subscription hook queues this job when it upgrades.
		const syncOrganizationId = savedInstallation.organizationId;
		const syncUrl = `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`;
		const syncBody = {
			installationDbId: savedInstallation.id,
			organizationId: syncOrganizationId,
		};
		if (await organizationSyncsNow(syncOrganizationId)) {
			if (fromDesktop) {
				await syncInstallationRepositories({
					installationDbId: savedInstallation.id,
					githubInstallationId: savedInstallation.installationId,
					organizationId: syncOrganizationId,
				}).catch((error) => {
					console.error(
						"[github/callback] Immediate repository sync failed:",
						error,
					);
				});
			}
			try {
				if (env.NODE_ENV === "development") {
					fetch(syncUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(syncBody),
					}).catch((error) => {
						console.error("[github/callback] Dev sync failed:", error);
					});
				} else {
					await qstash.publishJSON({
						url: syncUrl,
						body: syncBody,
						retries: 3,
					});
				}
			} catch (error) {
				console.error(
					"[github/callback] Failed to queue initial sync job:",
					error,
				);
				if (!fromDesktop) {
					return exit(`${settingsUrl}?warning=sync_queue_failed`);
				}
			}
		}

		if (fromDesktop) {
			return desktopPage(
				`Connected @${accountLogin}`,
				"Your repositories are now available in Superset. You can close this tab and return to Superset.",
				200,
			);
		}

		return exit(`${settingsUrl}?success=github_installed`);
	} catch (error) {
		console.error("[github/callback] Unexpected error:", error);
		return exit(`${settingsUrl}?error=unexpected`);
	}
}
