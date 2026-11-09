export type PageUpdateAction = "none" | "swap" | "offer";

/** What an open page does when the hub says a new version was published. */
export function pageUpdateAction({
	shownVersion,
	nextVersion,
	publishedBy,
	viewerId,
}: {
	shownVersion: number;
	nextVersion: number;
	publishedBy: string | null | undefined;
	viewerId: string | null | undefined;
}): PageUpdateAction {
	if (nextVersion === shownVersion) return "none";
	return viewerId && publishedBy === viewerId ? "swap" : "offer";
}
