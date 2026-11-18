import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import { linkChip } from "@superset/chats-core";
import type { ComponentProps } from "react";
import { MENTION_HREF } from "../../utils/mentionMarkdown";
import { AppLinkChip } from "./components/AppLinkChip";
import { PageLinkChip } from "./components/PageLinkChip";
import { WorkspaceLinkChip } from "./components/WorkspaceLinkChip";
import { pageSlugFromLink } from "./utils/pageLink";
import { workspaceIdFromLink } from "./utils/workspaceLink";

const Link = chatMarkdownComponents.a;

/**
 * A link in a message. A mention reads as a pill and goes nowhere; a link to
 * a workspace or a page is a card that opens it beside the thread; a bare
 * link to a known app is a chip with its mark.
 */
export function MessageLink(props: ComponentProps<typeof Link>) {
	if (props.href?.startsWith(MENTION_HREF)) {
		return (
			<span className="rounded-md bg-highlight/20 px-1 py-0.5 font-medium">
				{props.children}
			</span>
		);
	}
	const pageSlug = pageSlugFromLink(props.href);
	if (pageSlug && props.href) {
		return (
			<PageLinkChip slug={pageSlug} href={props.href}>
				{props.children}
			</PageLinkChip>
		);
	}
	const workspaceId = workspaceIdFromLink(props.href);
	if (!workspaceId || !props.href) {
		const chip =
			props.href && props.children === props.href ? linkChip(props.href) : null;
		return chip ? <AppLinkChip {...props} chip={chip} /> : <Link {...props} />;
	}
	return (
		<WorkspaceLinkChip workspaceId={workspaceId} href={props.href}>
			{props.children}
		</WorkspaceLinkChip>
	);
}
