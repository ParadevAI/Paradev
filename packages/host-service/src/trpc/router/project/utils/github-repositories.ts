import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { type ExecGh, execGh } from "../../workspace-creation/utils/exec-gh";

const githubRepositorySchema = z.object({
	full_name: z.string(),
	clone_url: z.string().url(),
	updated_at: z.string().nullish(),
});

type GitHubRepositoryRow = z.infer<typeof githubRepositorySchema>;

function parseGitHubRepositoryRows(raw: unknown): GitHubRepositoryRow[] {
	return z.array(z.array(githubRepositorySchema)).parse(raw).flat();
}

export function parseGitHubRepositories(raw: unknown) {
	return parseGitHubRepositoryRows(raw).map((repository) => ({
		fullName: repository.full_name,
		cloneUrl: repository.clone_url,
	}));
}

/**
 * Most recently updated first, like GitHub's `sort=updated`, with one row per
 * repository. Rows without a time keep their relative order at the end.
 */
function orderByRecentUpdate(rows: GitHubRepositoryRow[]) {
	const seen = new Set<string>();
	const unique = rows.filter((row) => {
		if (seen.has(row.full_name)) return false;
		seen.add(row.full_name);
		return true;
	});
	const time = (row: GitHubRepositoryRow) => {
		const ms = row.updated_at ? Date.parse(row.updated_at) : Number.NaN;
		return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
	};
	return unique
		.map((row, index) => ({ row, index, at: time(row) }))
		.sort((a, b) => b.at - a.at || a.index - b.index)
		.map(({ row }) => ({ fullName: row.full_name, cloneUrl: row.clone_url }));
}

const TIMEOUT_MESSAGE =
	"Listing GitHub repositories timed out. Check the `gh` connection on this host and try again.";

export async function listGitHubRepositories(
	runGh: ExecGh = execGh,
	{ signal = AbortSignal.timeout(30_000) } = {},
) {
	let rejectOnAbort = () => {};
	const aborted = new Promise<never>((_, reject) => {
		rejectOnAbort = () => reject(signal.reason);
	});
	signal.addEventListener("abort", rejectOnAbort, { once: true });
	const rows: GitHubRepositoryRow[] = [];
	try {
		for (let page = 1; ; page++) {
			signal.throwIfAborted();
			const raw = await Promise.race([
				runGh(
					[
						"api",
						"--method",
						"GET",
						"user/repos",
						"-f",
						"affiliation=owner,collaborator,organization_member",
						// Page in an order a push can't change. With `sort=updated`, a push
						// mid-walk moves a repository to page 1, so later pages repeat one
						// row and skip the moved repository. Recency is restored below.
						"-f",
						"sort=full_name",
						"-f",
						"direction=asc",
						"-f",
						"per_page=100",
						"-f",
						`page=${page}`,
						"--jq",
						"map({full_name, clone_url, updated_at})",
					],
					{ signal },
				),
				aborted,
			]);
			const entries = parseGitHubRepositoryRows([raw]);
			rows.push(...entries);
			if (entries.length < 100) return orderByRecentUpdate(rows);
		}
	} catch (error) {
		const failure = error instanceof Error ? error : new Error(String(error));
		const {
			code,
			killed,
			signal: killSignal,
			stderr,
		} = failure as Error & {
			code?: string | number;
			killed?: boolean;
			signal?: string;
			stderr?: string;
		};
		const authenticationRequired =
			code === 4 || /\(HTTP 401\)/.test(stderr ?? failure.message);
		const timedOut =
			signal.aborted || (killed && killSignal === "SIGTERM" && code == null);
		throw new TRPCError({
			code: authenticationRequired
				? "PRECONDITION_FAILED"
				: timedOut
					? "TIMEOUT"
					: "BAD_GATEWAY",
			message: authenticationRequired
				? `Could not list GitHub repositories. Run \`gh auth login\` on this host and try again. ${failure.message}`
				: timedOut
					? TIMEOUT_MESSAGE
					: failure.message,
			cause: error,
		});
	} finally {
		signal.removeEventListener("abort", rejectOnAbort);
	}
}
