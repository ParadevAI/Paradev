import type { ReactNode } from "react";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import type { GithubWorkItemLink } from "../../utils/githubWorkItem";
import { HostGithubWorkItemHoverCard } from "./components/HostGithubWorkItemHoverCard";

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
	if (!workspaceId) return children;
	return (
		<HostGithubWorkItemHoverCard link={link} url={url}>
			{children}
		</HostGithubWorkItemHoverCard>
	);
}
