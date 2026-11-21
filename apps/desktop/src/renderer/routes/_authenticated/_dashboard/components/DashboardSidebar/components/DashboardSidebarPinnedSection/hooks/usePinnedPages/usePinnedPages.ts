import { keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePageFavorites } from "renderer/routes/_authenticated/_dashboard/hooks/usePageFavorites";
import { usePagesList } from "renderer/routes/_authenticated/_dashboard/hooks/usePagesList";
import { MAX_FAVORITE_PAGE_IDS } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

export interface PinnedPage {
	id: string;
	slug: string;
	title: string;
}

export function usePinnedPages() {
	const { favoritePageIds, setFavorite } = usePageFavorites();
	const { items } = usePagesList(
		{ ids: favoritePageIds, limit: MAX_FAVORITE_PAGE_IDS },
		{
			enabled: favoritePageIds.length > 0,
			staleTime: 60_000,
			placeholderData: keepPreviousData,
		},
	);

	// The previous result stays on screen while a changed pin set loads, so
	// filter it to current pins and keep pin order.
	const pinnedPages = useMemo<PinnedPage[]>(() => {
		const byId = new Map(items.map((page) => [page.id, page]));
		return favoritePageIds.flatMap((id) => byId.get(id) ?? []);
	}, [items, favoritePageIds]);

	return { pinnedPages, setFavorite };
}
