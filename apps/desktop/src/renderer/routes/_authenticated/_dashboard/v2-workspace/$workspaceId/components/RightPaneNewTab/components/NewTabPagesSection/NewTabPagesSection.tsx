import { Trans } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import type { NewTabLists } from "../../../../hooks/useNewTabLists";
import type { PaneViewerData } from "../../../../types";
import { PagesListCard } from "../../../PagesListCard";

interface NewTabPagesSectionProps {
	pages: NewTabLists["pages"];
	onOpen: (pane: CreatePaneInput<PaneViewerData>) => void;
}

export function NewTabPagesSection({ pages, onOpen }: NewTabPagesSectionProps) {
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
