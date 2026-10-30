import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { type ExecGh, execGh } from "../../workspace-creation/utils/exec-gh";

const PAGE_SIZE = 100;

const githubRepositorySchema = z.object({
	full_name: z.string(),
	clone_url: z.string().url(),
});

export interface GitHubRepository {
	fullName: string;
	cloneUrl: string;
}

export type GitHubRepositories = GitHubRepository[];

export interface GitHubRepositoryPage {
	repositories: GitHubRepositories;
	hasMore: boolean;
}

export function parseGitHubRepositories(raw: unknown) {
	const pages = z.array(z.array(githubRepositorySchema)).parse(raw);
	return pages.flat().map((repository) => ({
		fullName: repository.full_name,
		cloneUrl: repository.clone_url,
	}));
}

export async function fetchGitHubRepositoryPage(
	page: number,
	runGh: ExecGh = execGh,
): Promise<GitHubRepositoryPage> {
	try {
		// Offset paging needs an order a push cannot change: `sort=updated`
		// reorders the list between pages and repeats or drops a repository.
		const raw = await runGh([
			"api",
			"--method",
			"GET",
			"user/repos",
			"-f",
			"affiliation=owner,collaborator,organization_member",
			"-f",
			"sort=full_name",
			"-f",
			`per_page=${PAGE_SIZE}`,
			"-f",
			`page=${page}`,
			"--jq",
			"map({full_name, clone_url})",
		]);
		const repositories = parseGitHubRepositories([raw]);
		return { repositories, hasMore: repositories.length === PAGE_SIZE };
	} catch (error) {
		const failure = error instanceof Error ? error : new Error(String(error));
		const { code, killed, signal, stderr } = failure as Error & {
			code?: string | number;
			killed?: boolean;
			signal?: string;
			stderr?: string;
		};
		const authenticationRequired =
			code === 4 || /\(HTTP 401\)/.test(stderr ?? failure.message);
		throw new TRPCError({
			code: authenticationRequired
				? "PRECONDITION_FAILED"
				: killed && signal === "SIGTERM" && code == null
					? "TIMEOUT"
					: "BAD_GATEWAY",
			message: authenticationRequired
				? `Could not list GitHub repositories. Run \`gh auth login\` on this host and try again. ${failure.message}`
				: failure.message,
			cause: error,
		});
	}
}

export async function listGitHubRepositories(runGh: ExecGh = execGh) {
	const repositories: GitHubRepositories = [];
	for (let page = 1; ; page++) {
		const result = await fetchGitHubRepositoryPage(page, runGh);
		repositories.push(...result.repositories);
		if (!result.hasMore) return repositories;
	}
}
