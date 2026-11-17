import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import { useNavigate } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { MENTION_HREF } from "../../utils/mentionMarkdown";
import { workspaceIdFromLink } from "./utils/workspaceLink";

const Link = chatMarkdownComponents.a;

/**
 * A link in a message. A mention reads as a pill and goes nowhere; a link to
 * a workspace opens it here in the app.
 */
export function MessageLink(props: ComponentProps<typeof Link>) {
	const navigate = useNavigate();
	if (props.href?.startsWith(MENTION_HREF)) {
		return (
			<span className="rounded-md bg-highlight/20 px-1 py-0.5 font-medium">
				{props.children}
			</span>
		);
	}
	const workspaceId = workspaceIdFromLink(props.href);
	if (!workspaceId) return <Link {...props} />;
	return (
		<Link
			{...props}
			onClick={(event) => {
				event.preventDefault();
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId },
				});
			}}
		/>
	);
}
