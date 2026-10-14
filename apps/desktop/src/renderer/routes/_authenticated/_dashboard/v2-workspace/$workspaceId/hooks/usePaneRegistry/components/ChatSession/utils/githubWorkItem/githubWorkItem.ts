export type GithubWorkItemLink = {
	kind: "pr" | "issue";
	owner: string;
	repo: string;
	number: number;
};

const WORK_ITEM_PATH =
	/^\/([^/]+)\/([^/]+)\/(pull|issues)\/([1-9]\d*)(?:\/[^/]*)?\/?$/;

/** The pull request or issue a GitHub URL points at, or null for any other page there. */
export function parseGithubWorkItemUrl(
	href: string,
): GithubWorkItemLink | null {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return null;
	}
	if (!/^(www\.)?github\.com$/.test(url.hostname)) return null;
	const match = WORK_ITEM_PATH.exec(url.pathname);
	if (!match) return null;
	const [, owner = "", repo = "", resource, digits = ""] = match;
	const number = Number(digits);
	if (!Number.isSafeInteger(number)) return null;
	return {
		kind: resource === "pull" ? "pr" : "issue",
		owner,
		repo,
		number,
	};
}
