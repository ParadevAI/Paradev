import type { PageShareRole, SelectPage } from "@superset/db/schema";
import { isPageReadable } from "./access";
import { isPubliclyServed } from "./shared-version";

export type PageRead = "member" | "public" | "none";

/**
 * How a caller may read a page: by the rules of its own organization, as
 * anyone with the link, or not at all. `reader` is null for a caller that may
 * read no organization pages (a Dev acting for someone other than its owner).
 */
export function pageReadFor({
	page,
	organizationId,
	reader,
	shareRole,
}: {
	page: Pick<
		SelectPage,
		| "id"
		| "organizationId"
		| "visibility"
		| "organizationRole"
		| "createdByUserId"
		| "takenDownAt"
	>;
	organizationId: string;
	reader: string | null;
	shareRole: PageShareRole | null;
}): PageRead {
	if (
		reader &&
		page.organizationId === organizationId &&
		isPageReadable(page, reader, shareRole)
	) {
		return "member";
	}
	return isPubliclyServed(page) ? "public" : "none";
}
