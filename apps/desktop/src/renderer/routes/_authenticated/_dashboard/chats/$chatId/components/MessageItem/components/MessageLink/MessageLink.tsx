import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import type { ComponentProps } from "react";
import { MENTION_HREF } from "../../utils/mentionMarkdown";

const Link = chatMarkdownComponents.a;

/** A link in a message; a mention reads as a pill and goes nowhere. */
export function MessageLink(props: ComponentProps<typeof Link>) {
	if (!props.href?.startsWith(MENTION_HREF)) return <Link {...props} />;
	return (
		<span className="rounded-md bg-highlight/20 px-1 py-0.5 font-medium">
			{props.children}
		</span>
	);
}
