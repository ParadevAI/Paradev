export interface PullRequestActivityAuthor {
	/** Null when GitHub maps the actor to no account. */
	login: string | null;
	name?: string | null;
	avatarUrl?: string | null;
}

export function pullRequestAuthorLabel(
	author: PullRequestActivityAuthor | null,
): string {
	return author?.login ?? author?.name ?? "ghost";
}
