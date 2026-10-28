import { Octokit } from "@octokit/core";
import {
	type PullRequestOnGithub,
	pullRequestOnGithub,
} from "@superset/shared/pull-request-github";
import { githubUserTokenFor } from "../../../lib/github-user";
import { installationOctokit } from "../../../lib/sandbox/clone-token";
import { userError } from "../../../trpc";
import { verifyOrgMembership } from "../utils";
import { findInstalledRepository } from "./find-installed-repository";

interface PullRequestInput {
	organizationId: string;
	repoFullName: string;
	number: number;
}

type ViewerPullRequest = PullRequestOnGithub & { number: number };

function notConnectedError() {
	return userError({
		code: "PRECONDITION_FAILED",
		message: "Connect GitHub in Settings to act on pull requests as yourself",
		i18nKey: "serverError.githubUser.notConnected",
	});
}

function onGithub(
	octokit: Octokit,
	input: PullRequestInput,
): ViewerPullRequest {
	const [owner = "", repo = ""] = input.repoFullName.split("/");
	return {
		...pullRequestOnGithub(
			{
				graphql: (query, variables) => octokit.graphql(query, variables),
				request: (route, parameters) => octokit.request(route, parameters),
			},
			{ owner, repo, number: input.number },
		),
		number: input.number,
	};
}

/**
 * GitHub as the person asking, with their own connection; without one they
 * are asked to connect. The organization's App is not a fallback: its rate
 * limit is shared by everything the organization runs.
 */
export async function asViewer(
	userId: string,
	input: PullRequestInput,
): Promise<ViewerPullRequest> {
	await verifyOrgMembership(userId, input.organizationId);
	const token = await githubUserTokenFor(userId);
	if (!token) throw notConnectedError();
	return onGithub(new Octokit({ auth: token }), input);
}

/**
 * `asViewer`, falling back to the organization's App installation. Only for
 * `getPullRequestDiff`, which released desktops already call without a
 * connection; new reads must not use it.
 */
export async function asViewerOrInstallation(
	userId: string,
	input: PullRequestInput,
): Promise<ViewerPullRequest> {
	await verifyOrgMembership(userId, input.organizationId);
	const token = await githubUserTokenFor(userId);
	if (token) return onGithub(new Octokit({ auth: token }), input);
	const { installation } = await findInstalledRepository(
		input.organizationId,
		input.repoFullName,
	);
	return onGithub(
		await installationOctokit(installation.installationId),
		input,
	);
}
