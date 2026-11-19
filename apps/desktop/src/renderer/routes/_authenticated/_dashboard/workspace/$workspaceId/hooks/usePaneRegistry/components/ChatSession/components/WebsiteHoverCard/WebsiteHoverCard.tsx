import { parseSlackLink } from "@superset/shared/slack-links";
import type { ReactNode } from "react";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { PageHoverCard } from "./components/PageHoverCard";
import { SlackHoverCard } from "./components/SlackHoverCard";

/**
 * A card on hover or focus of a web link, with the page's title, description
 * and preview image. Loading starts when the pointer arrives, so the data is
 * usually there by the time the card opens.
 */
export function WebsiteHoverCard({
	children,
	url,
}: {
	children: ReactNode;
	url: string;
}) {
	const { workspaceId } = useChatPaneActions();
	if (!workspaceId) return children;
	if (parseSlackLink(url)) {
		return <SlackHoverCard url={url}>{children}</SlackHoverCard>;
	}
	return (
		<PageHoverCard url={url} workspaceId={workspaceId}>
			{children}
		</PageHoverCard>
	);
}
