import { workspaceTrpc } from "@superset/workspace-client";
import { useState } from "react";
import { useChatPaneActions } from "../../../../../../../../providers/ChatPaneActionsProvider";
import { displayHost } from "../../../../../../../../utils/displayHost";
import { LinkMenu } from "../../../../../../../LinkMenu";
import { WebsiteHoverCard } from "../../../../../../../WebsiteHoverCard";

/** A link as its bare host, until a hover has loaded its title and icon. */
export function LinkPreviewChip({ url }: { url: string }) {
	const { openLink } = useChatPaneActions();
	const { data } = workspaceTrpc.linkPreview.get.useQuery(
		{ url, image: true },
		{ enabled: false },
	);
	const [brokenIcon, setBrokenIcon] = useState<string | null>(null);
	const host = displayHost(url);
	const icon = data?.iconDataUrl;
	return (
		<WebsiteHoverCard url={url}>
			<LinkMenu href={url}>
				<a
					className="group/link-preview text-link wrap-anywhere hover:text-link-hover"
					href={url}
					onClick={(event) => {
						if (openLink?.(url, event)) event.preventDefault();
					}}
					rel="noreferrer"
					target="_blank"
				>
					<span
						aria-hidden="true"
						className="mr-1 inline-flex size-4 select-none items-center justify-center overflow-hidden rounded bg-background/50 align-[-0.125em] font-semibold text-[9px] text-foreground/55 uppercase"
					>
						{icon && icon !== brokenIcon ? (
							<img
								alt=""
								className="size-3.5 object-contain"
								draggable={false}
								onError={() => setBrokenIcon(icon)}
								src={icon}
							/>
						) : (
							host.charAt(0)
						)}
					</span>
					<span className="font-medium underline-offset-2 group-hover/link-preview:underline">
						{data?.title?.trim() || host}
					</span>
				</a>
			</LinkMenu>
		</WebsiteHoverCard>
	);
}
