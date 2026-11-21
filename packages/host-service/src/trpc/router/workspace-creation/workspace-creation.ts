import { router } from "../../index";
import {
	adopt,
	getPullRequestRowDetails,
	getRepoContributors,
	listProjectWorktrees,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
	searchRemoteBranches,
} from "./procedures";

export const workspaceCreationRouter = router({
	searchBranches,
	adopt,
	getPullRequestRowDetails,
	getRepoContributors,
	listProjectWorktrees,
	searchGitHubIssues,
	searchPullRequests,
	searchRemoteBranches,
});
