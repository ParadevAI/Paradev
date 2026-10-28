import { Trans } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import { usePagesList } from "renderer/routes/_authenticated/_dashboard/hooks/usePagesList";
import type { PaneViewerData } from "../../../../types";
import { PagesListCard } from "../../../PagesListCard";

const PAGE_LIMIT = 4;

interface NewTabPagesSectionProps {
	workspaceId: string;
	onOpen: (pane: CreatePaneInput<PaneViewerData>) => void;
}

export function NewTabPagesSection({
	workspaceId,
	onOpen,
}: NewTabPagesSectionProps) {
	const { items } = usePagesList(
		{ workspaceId, limit: PAGE_LIMIT },
		{ staleTime: 60_000 },
	);
	const pages = items.slice(0, PAGE_LIMIT);
	if (pages.length === 0) return null;

	return (
		<CloudSection title={<Trans>Pages</Trans>}>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 px-1">
				{pages.map((page) => (
					<PagesListCard
						key={page.id}
						page={page}
						isActive={false}
						onOpen={() =>
							onOpen({
								kind: "page",
								data: { pageId: page.id, slug: page.slug, title: page.title },
							})
						}
					/>
				))}
			</div>
		</CloudSection>
	);
}
