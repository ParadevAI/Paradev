import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import type { ComponentProps } from "react";
import { MENTION_HREF } from "../../utils/mentionMarkdown";
import { WorkspaceLinkChip } from "./components/WorkspaceLinkChip";
import { workspaceIdFromLink } from "./utils/workspaceLink";

const Link = chatMarkdownComponents.a;

/**
 * A link in a message. A mention reads as a pill and goes nowhere; a link to
 * a workspace is a row that opens it here in the app.
 */
export function MessageLink(props: ComponentProps<typeof Link>) {
	if (props.href?.startsWith(MENTION_HREF)) {
		return (
			<span className="rounded-md bg-highlight/20 px-1 py-0.5 font-medium">
				{props.children}
			</span>
		);
	}
	const workspaceId = workspaceIdFromLink(props.href);
	if (!workspaceId || !props.href) return <Link {...props} />;
	return (
		<WorkspaceLinkChip workspaceId={workspaceId} href={props.href}>
			{props.children}
		</WorkspaceLinkChip>
	);
}
