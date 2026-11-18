import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import type { LinkChip } from "@superset/chats-core";
import type { ComponentProps } from "react";
import { PluginIcon } from "renderer/components/PluginIcon";

const Link = chatMarkdownComponents.a;

interface AppLinkChipProps extends ComponentProps<typeof Link> {
	chip: LinkChip;
}

/** A bare link to an app the chats know (a Linear issue, a GitHub pull request) as its mark and a short name. */
export function AppLinkChip({ chip, ...props }: AppLinkChipProps) {
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
