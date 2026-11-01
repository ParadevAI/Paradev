export interface MenuPageSource {
	id: string;
	slug: string;
	title: string;
	visibility: string;
	publishedAt?: Date | string | null;
	updatedAt: Date | string;
}

export interface MenuPage {
	id: string;
	slug: string;
	title: string;
	isPrivate: boolean;
	publishedAtMs: number;
	isNew: boolean;
}

function toMenuPage(page: MenuPageSource, seenAt: number): MenuPage {
	const publishedAtMs = new Date(page.publishedAt ?? page.updatedAt).getTime();
	return {
		id: page.id,
		slug: page.slug,
		title: page.title,
		isPrivate: page.visibility === "just_me",
		publishedAtMs,
		isNew: publishedAtMs > seenAt,
	};
}

export function selectMenuPages({
	workspacePages,
	seenAt,
}: {
	workspacePages: readonly MenuPageSource[];
	seenAt: number;
}): { workspace: MenuPage[]; hasNew: boolean } {
	const workspace = workspacePages
		.map((page) => toMenuPage(page, seenAt))
		.sort((a, b) => b.publishedAtMs - a.publishedAtMs);

	return { workspace, hasNew: workspace.some((page) => page.isNew) };
}
