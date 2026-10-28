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

export interface PullRequestInput {
	organizationId: string;
	repoFullName: string;
	number: number;
}

export type ViewerPullRequest = PullRequestOnGithub & {
	number: number;
	/** False when the organization's App reads on the viewer's behalf. */
	actsAsViewer: boolean;
};

export function notConnectedError() {
	return userError({
		code: "PRECONDITION_FAILED",
		message: "Connect GitHub in Settings to act on pull requests as yourself",
		i18nKey: "serverError.githubUser.notConnected",
	});
}

function onGithub(
	octokit: Octokit,
	input: PullRequestInput,
	actsAsViewer: boolean,
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
		actsAsViewer,
	};
}

/**
 * GitHub as the person asking: their own connection when they have one, the
 * organization's App installation otherwise. Reads may take either; a write
 * must be theirs, or GitHub would record it under the App's name.
 */
export async function asViewer(
	userId: string,
	input: PullRequestInput,
	access: "read" | "write",
): Promise<ViewerPullRequest> {
	await verifyOrgMembership(userId, input.organizationId);
	const token = await githubUserTokenFor(userId);
	if (token) return onGithub(new Octokit({ auth: token }), input, true);
	if (access === "write") throw notConnectedError();
	// The App seeing nothing says nothing about the viewer: their own account may.
	const { installation } = await findInstalledRepository(
		input.organizationId,
		input.repoFullName,
	).catch((error: { code?: string }) => {
		throw error.code === "NOT_FOUND" || error.code === "PRECONDITION_FAILED"
			? notConnectedError()
			: error;
	});
	return onGithub(
		await installationOctokit(installation.installationId),
		input,
		false,
	);
}
