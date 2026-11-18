import type { ReactNode } from "react";
import { env } from "renderer/env.renderer";
import { parseGithubWorkItemUrl } from "../../utils/githubWorkItem";
import { parseSupersetAppLink } from "../../utils/supersetAppLink";
import { ChatPreviewHoverCard } from "../ChatPreviewHoverCard";
import { GithubWorkItemHoverCard } from "../GithubWorkItemHoverCard";
import { WebsiteHoverCard } from "../WebsiteHoverCard";

const WEB_URL = env.NEXT_PUBLIC_WEB_URL;

export function LinkHoverCard({
	link,
	children,
}: {
	link: string;
	children: ReactNode;
}) {
	const workItem = parseGithubWorkItemUrl(link);
	if (workItem) {
		return (
			<GithubWorkItemHoverCard link={workItem} url={link}>
				{children}
			</GithubWorkItemHoverCard>
		);
	}
	const app = parseSupersetAppLink(link, WEB_URL);
	if (app?.kind === "chat") {
		return (
			<ChatPreviewHoverCard
				sessionId={app.sessionId}
				workspaceId={app.workspaceId}
			>
				{children}
			</ChatPreviewHoverCard>
		);
	}
	if (app) return children;
	return <WebsiteHoverCard url={link}>{children}</WebsiteHoverCard>;
}
