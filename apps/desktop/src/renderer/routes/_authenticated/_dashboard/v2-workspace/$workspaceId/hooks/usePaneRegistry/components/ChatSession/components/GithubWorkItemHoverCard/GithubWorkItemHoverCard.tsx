import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { workspaceTrpc } from "@superset/workspace-client";
import { type ReactNode, useState } from "react";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import type { GithubWorkItemLink } from "../../utils/githubWorkItem";
import {
	GithubWorkItemCard,
	type GithubWorkItemLoad,
} from "./components/GithubWorkItemCard";

const OPEN_DELAY_MS = 220;
const CLOSE_DELAY_MS = 100;
const FRESH_FOR_MS = 2 * 60 * 1000;

/**
 * A card on hover or focus of a pull request or issue link. The host asks
 * GitHub when the pointer arrives, so the card usually opens already filled.
 */
export function GithubWorkItemHoverCard({
	children,
	link,
	url,
}: {
	children: ReactNode;
	link: GithubWorkItemLink;
	url: string;
}) {
	const { workspaceId } = useChatPaneActions();
	const [open, setOpen] = useState(false);
	const [wanted, setWanted] = useState(false);
	const query = workspaceTrpc.github.getWorkItem.useQuery(
		{
			owner: link.owner,
			repo: link.repo,
			kind: link.kind,
			number: link.number,
		},
		{
			enabled: (wanted || open) && Boolean(workspaceId),
			staleTime: FRESH_FOR_MS,
			retry: false,
		},
	);
	const load: GithubWorkItemLoad = query.data
		? { status: "ready", item: query.data }
		: query.isError || !workspaceId
			? { status: "unavailable" }
			: { status: "loading" };
	return (
		<HoverCard
			closeDelay={CLOSE_DELAY_MS}
			onOpenChange={setOpen}
			open={open}
			openDelay={OPEN_DELAY_MS}
		>
			<HoverCardTrigger
				asChild
				onClick={() => setOpen(false)}
				onContextMenu={() => setOpen(false)}
				onFocus={() => setWanted(true)}
				onPointerEnter={(event) => {
					if (event.pointerType !== "touch") setWanted(true);
				}}
			>
				{children}
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border-foreground/[0.08] p-0 shadow-xl"
				side="top"
				sideOffset={6}
			>
				<GithubWorkItemCard
					link={link}
					load={load}
					onOpen={() => setOpen(false)}
					url={url}
				/>
			</HoverCardContent>
		</HoverCard>
	);
}
