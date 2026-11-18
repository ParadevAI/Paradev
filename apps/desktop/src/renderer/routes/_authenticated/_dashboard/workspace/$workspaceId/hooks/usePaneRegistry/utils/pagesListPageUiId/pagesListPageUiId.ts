import type { PagePaneData } from "../../../../types";

export function pagesListPageUiId(paneId: string, page: PagePaneData): string {
	return `${paneId}:${page.pageId ?? page.slug}`;
}
