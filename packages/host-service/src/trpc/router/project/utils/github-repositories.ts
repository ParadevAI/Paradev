import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	type ExecGh,
	execGh,
	GH_CALL_TIMEOUT_MS,
} from "../../workspace-creation/utils/exec-gh";

const LISTING_BUDGET_MS = 20_000;

const githubRepositorySchema = z.object({
	full_name: z.string(),
	clone_url: z.string().url(),
});

export function parseGitHubRepositories(raw: unknown) {
	const pages = z.array(z.array(githubRepositorySchema)).parse(raw);
	return pages.flat().map((repository) => ({
		fullName: repository.full_name,
		cloneUrl: repository.clone_url,
	}));
}

interface ListingDeadline {
	budgetMs?: number;
	now?: () => number;
}

function listingDeadlineError(budgetMs: number) {
	return new TRPCError({
		code: "TIMEOUT",
		message: `Listing GitHub repositories took longer than ${Math.round(budgetMs / 1000)}s. Try again.`,
	});
}

function isGhTimeout(error: unknown) {
	const failure = error as {
		code?: string | number;
		killed?: boolean;
		signal?: string;
	};
	return (
		failure?.killed === true &&
		failure.signal === "SIGTERM" &&
		failure.code == null
	);
}

function withListingDeadline(
	runGh: ExecGh,
	budgetMs: number,
	now: () => number,
): ExecGh {
	const deadline = now() + budgetMs;
	return async (args, options) => {
		const remaining = deadline - now();
		if (remaining <= 0) throw listingDeadlineError(budgetMs);
		const timeout = Math.min(options?.timeout ?? GH_CALL_TIMEOUT_MS, remaining);
		const call = runGh(args, { ...options, timeout }).catch((error) => {
			// A kill by the remaining budget is the listing's own deadline, not
			// a slow page, so report the budget instead of the `gh` command line.
			if (timeout === remaining && isGhTimeout(error)) {
				throw listingDeadlineError(budgetMs);
			}
			throw error;
		});
		// `gh` starts its own timer only after the login-shell environment
		// lookup, so the walk needs a timer to bound the whole call.
		const expiry = Promise.withResolvers<never>();
		const timer = setTimeout(
			() => expiry.reject(listingDeadlineError(budgetMs)),
			remaining,
		);
		call.catch(() => {});
		try {
			return await Promise.race([call, expiry.promise]);
		} finally {
			clearTimeout(timer);
		}
	};
}

export async function listGitHubRepositories(
	runGh: ExecGh = execGh,
	{ budgetMs = LISTING_BUDGET_MS, now = Date.now }: ListingDeadline = {},
) {
	const repositories: ReturnType<typeof parseGitHubRepositories> = [];
	const runBoundedGh = withListingDeadline(runGh, budgetMs, now);
	try {
		for (let page = 1; ; page++) {
			const raw = await runBoundedGh([
				"api",
				"--method",
				"GET",
				"user/repos",
				"-f",
				"affiliation=owner,collaborator,organization_member",
				"-f",
				"sort=updated",
				"-f",
				"per_page=100",
				"-f",
				`page=${page}`,
				"--jq",
				"map({full_name, clone_url})",
			]);
			const entries = parseGitHubRepositories([raw]);
			repositories.push(...entries);
			if (entries.length < 100) return repositories;
		}
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		const failure = error instanceof Error ? error : new Error(String(error));
		const { code, stderr } = failure as Error & {
			code?: string | number;
			stderr?: string;
		};
		const authenticationRequired =
			code === 4 || /\(HTTP 401\)/.test(stderr ?? failure.message);
		throw new TRPCError({
			code: authenticationRequired
				? "PRECONDITION_FAILED"
				: isGhTimeout(error)
					? "TIMEOUT"
					: "BAD_GATEWAY",
			message: authenticationRequired
				? `Could not list GitHub repositories. Run \`gh auth login\` on this host and try again. ${failure.message}`
				: failure.message,
			cause: error,
		});
	}
}
