import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import { linkChip } from "@superset/chats-core";
import type { ComponentProps } from "react";
import { PluginIcon } from "renderer/components/PluginIcon";

const Link = chatMarkdownComponents.a;

/**
 * A link in chat markdown. A bare address of an app the chats know (a Linear
 * issue, a GitHub pull request) is a chip with the app's mark and a short
 * name; any other link is an ordinary one.
 */
export function AppLinkChip(props: ComponentProps<typeof Link>) {
	const chip =
		props.href && props.children === props.href ? linkChip(props.href) : null;
	if (!chip) return <Link {...props} />;
	return (
		<Link
			{...props}
			title={props.href}
			className="my-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md bg-background/50 px-1.5 py-0.5 align-middle font-medium text-foreground text-sm no-underline transition-colors hover:bg-background/80"
		>
			<PluginIcon className="size-3.5 shrink-0" pluginName={chip.app} />
			<span className="min-w-0 truncate">{chip.label}</span>
		</Link>
	);
}
