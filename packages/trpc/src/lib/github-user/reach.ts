/**
 * Whether a person may work on a set of repositories through a cloud box.
 * The App installation says Superset may touch a repository; the person's
 * own GitHub connection says they may. A private repository needs both, so
 * membership of the Superset organization alone never reaches a private
 * repository GitHub would refuse the person.
 */
import { userError } from "../../i18n-error";
import {
	githubRepositoriesOutOfReach,
	githubUserConnectionConfigured,
	githubUserTokenFor,
} from "./github-user";

export interface ReachRepository {
	owner: string;
	name: string;
	fullName: string;
	isPrivate: boolean;
	disconnectedAt: Date | null;
}

export async function assertGithubReach(args: {
	userId: string;
	repositories: readonly ReachRepository[];
	/** A person's own work needs their connection; an automation runs on the App's token. */
	requireConnection: boolean;
}): Promise<void> {
	const disconnected = args.repositories.find((repo) => repo.disconnectedAt);
	if (disconnected) {
		throw userError({
			code: "PRECONDITION_FAILED",
			message: `${disconnected.fullName} is no longer connected to GitHub; reinstall the Superset GitHub App on its account`,
			i18nKey: "serverError.cloudWorkspace.repositoryDisconnected",
			params: { repoFullName: disconnected.fullName },
		});
	}
	const privateRepositories = args.repositories.filter(
		(repo) => repo.isPrivate,
	);
	if (privateRepositories.length === 0 || !githubUserConnectionConfigured())
		return;
	const token = await githubUserTokenFor(args.userId);
	if (!token) {
		if (!args.requireConnection) return;
		throw userError({
			code: "FORBIDDEN",
			message:
				"Connect your GitHub account in Settings › Connections to work on a private repository",
			i18nKey: "serverError.cloudWorkspace.githubConnectionRequired",
		});
	}
	const outOfReach = await githubRepositoriesOutOfReach({
		token,
		repositories: privateRepositories,
	});
	if (outOfReach.length > 0) {
		throw userError({
			code: "FORBIDDEN",
			message: `Your GitHub account cannot reach ${outOfReach.join(", ")}`,
			i18nKey: "serverError.cloudWorkspace.githubRepositoryOutOfReach",
		});
	}
}
