import { db } from "@superset/db/client";
import { githubRepositories } from "@superset/db/schema";
import { findProviderIdentity } from "@superset/db/utils";
import { desc, eq } from "drizzle-orm";
import { installationOctokit } from "../../../lib/sandbox/clone-token";
import type { TriggerOptionSource } from "../trigger-options";
import { organizationInstallations } from "./organization-installations";

/** The synced repositories of the organization's installations, newest first. */
export async function listGithubRepositories(organizationId: string) {
	return db.query.githubRepositories.findMany({
		where: eq(githubRepositories.organizationId, organizationId),
		orderBy: [desc(githubRepositories.updatedAt)],
	});
}

/**
 * repoId is GitHub's numeric id, which is what the matcher compares against —
 * a full name would stop matching the moment someone renames the repo.
 */
const repositories: TriggerOptionSource = async ({ organizationId }) => {
	const list = await listGithubRepositories(organizationId);
	return list.map((repo) => {
		// Name as the label, owner as the muted hint beside it.
		const slash = repo.fullName.indexOf("/");
		if (slash < 0) return { id: repo.repoId, label: repo.fullName };
		return {
			id: repo.repoId,
			label: repo.fullName.slice(slash + 1),
			hint: repo.fullName.slice(0, slash),
		};
	});
};

const PER_PAGE = 100;
const MAX_PEOPLE = 1000;

type GithubAccount = { id: number | bigint; login: string };
type Page = (page: number) => Promise<{ data: GithubAccount[] }>;

async function collect(seen: Map<string, string>, fetchPage: Page) {
	for (let page = 1; seen.size < MAX_PEOPLE; page++) {
		const { data } = await fetchPage(page);
		for (const account of data) seen.set(String(account.id), account.login);
		if (data.length < PER_PAGE) return;
	}
}

function isPermissionError(error: unknown): boolean {
	const status = (error as { status?: unknown }).status;
	return status === 403 || status === 404;
}

/**
 * The accounts a GitHub trigger can filter on, keyed by GitHub's numeric id —
 * the same value a delivery's `sender.id` carries, so a login rename cannot
 * break a saved filter. Organization installations list the organization's
 * members; user installations list the collaborators of the synced
 * repositories, deduplicated.
 */
const people: TriggerOptionSource = async ({ organizationId }) => {
	const installations = await organizationInstallations(organizationId);
	const seen = new Map<string, string>();
	for (const installation of installations) {
		if (seen.size >= MAX_PEOPLE) break;
		try {
			const octokit = await installationOctokit(installation.installationId);
			if (installation.accountType === "Organization") {
				await collect(seen, (page) =>
					octokit.request("GET /orgs/{org}/members", {
						org: installation.accountLogin,
						per_page: PER_PAGE,
						page,
					}),
				);
				continue;
			}
			const repositories = await db.query.githubRepositories.findMany({
				where: eq(githubRepositories.installationId, installation.id),
				columns: { owner: true, name: true },
			});
			let refusedRepositories = 0;
			for (const repository of repositories) {
				if (seen.size >= MAX_PEOPLE) break;
				try {
					await collect(seen, (page) =>
						octokit.request("GET /repos/{owner}/{repo}/collaborators", {
							owner: repository.owner,
							repo: repository.name,
							per_page: PER_PAGE,
							page,
						}),
					);
				} catch (error) {
					if (!isPermissionError(error)) throw error;
					refusedRepositories += 1;
				}
			}
			if (refusedRepositories > 0) {
				console.warn(
					`[integration.github] collaborators refused for ${refusedRepositories} of ${repositories.length} repositories of ${installation.accountLogin}`,
				);
			}
		} catch (error) {
			// The App was installed without the members permission (or the
			// installation is gone): skip this account, not a red editor.
			if (!isPermissionError(error)) throw error;
			console.warn("[integration.github] people refused:", error);
		}
	}

	return [...seen]
		.map(([id, login]) => ({ id, label: login }))
		.sort((a, b) => a.label.localeCompare(b.label));
};

/**
 * The caller's own GitHub id — the editor uses its presence to warn when a
 * "Me" scope cannot resolve for them. Same lookup the dispatcher runs when a
 * "Me" trigger fires, so the warning and the runtime agree.
 */
const viewer: TriggerOptionSource = async ({ organizationId, userId }) => {
	const identity = await findProviderIdentity({
		organizationId,
		userId,
		provider: "github",
	});
	return identity
		? [{ id: identity.externalId, label: identity.handle ?? "Me" }]
		: [];
};

export const githubTriggerOptions = { repositories, people, viewer };
