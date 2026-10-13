import { workspaceTrpc } from "@superset/workspace-client";
import { useState } from "react";
import { useChatPaneActions } from "../../../../../../../../providers/ChatPaneActionsProvider";
import { displayHost } from "../../utils/textLinks";

export function LinkPreviewChip({ url }: { url: string }) {
	const { openLink, workspaceId } = useChatPaneActions();
	const { data } = workspaceTrpc.linkPreview.get.useQuery(
		{ url },
		{
			enabled: Boolean(workspaceId),
			staleTime: Number.POSITIVE_INFINITY,
			retry: false,
		},
	);
	const [brokenIcon, setBrokenIcon] = useState<string | null>(null);
	const host = displayHost(url);
	const icon = data?.iconDataUrl;
	return (
		<a
			className="group/link-preview text-link wrap-anywhere hover:text-link-hover"
			href={url}
			onClick={(event) => {
				if (openLink?.(url, event)) event.preventDefault();
			}}
			rel="noreferrer"
			target="_blank"
			title={url}
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
	);
}
