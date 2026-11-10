import { z } from "zod";
import type { ExecGh } from "./exec-gh";

const PER_PAGE = 100;

const branchNamesSchema = z.array(z.string());

/**
 * Every branch name of a GitHub repo. The branches endpoint returns 100 per
 * page in name order, so a busy repo's default branch is rarely on page one.
 */
export async function listRemoteBranchNames(
	runGh: ExecGh,
	owner: string,
	repo: string,
): Promise<string[]> {
	const names: string[] = [];
	for (let page = 1; ; page++) {
		const raw = await runGh([
			"api",
			"--method",
			"GET",
			`repos/${owner}/${repo}/branches`,
			"-f",
			`per_page=${PER_PAGE}`,
			"-f",
			`page=${page}`,
			"--jq",
			"map(.name)",
		]);
		const pageNames = branchNamesSchema.parse(raw);
		names.push(...pageNames);
		if (pageNames.length < PER_PAGE) return names;
	}
}
