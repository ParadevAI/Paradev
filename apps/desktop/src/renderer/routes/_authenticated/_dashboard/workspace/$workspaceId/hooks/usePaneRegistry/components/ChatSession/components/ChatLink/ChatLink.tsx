import { useLingui } from "@lingui/react/macro";
import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import type { ComponentProps, ReactNode } from "react";
import { env } from "renderer/env.renderer";
import { useOpenAppLink } from "../../hooks/useOpenAppLink";
import { ChatLinkProvider } from "../../providers/ChatLinkProvider";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { parseGithubWorkItemUrl } from "../../utils/githubWorkItem";
import { unfurlLink } from "../../utils/linkUnfurl";
import { LOCAL_PATH_PREFIX } from "../../utils/remarkLocalPathLinks";
import { parseSupersetAppLink } from "../../utils/supersetAppLink";
import { ChatPreviewHoverCard } from "../ChatPreviewHoverCard";
import { FileLinkMenu } from "../FileLinkMenu";
import { GithubWorkItemHoverCard } from "../GithubWorkItemHoverCard";
import { LinkMenu } from "../LinkMenu";
import { WebsiteHoverCard } from "../WebsiteHoverCard";
import { EnvironmentLinkLabel } from "./components/EnvironmentLinkLabel";
import { LinkUnfurlIcon } from "./components/LinkUnfurlIcon";
import { WorkspaceLinkLabel } from "./components/WorkspaceLinkLabel";

const MarkdownLink = chatMarkdownComponents.a;
const UNFURLED_LINK_CLASSNAME =
	"rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-foreground no-underline box-decoration-clone transition-colors hover:bg-foreground/[0.12] hover:text-foreground hover:no-underline";

function isWebLink(href: string): boolean {
	try {
		const url = new URL(href);
		return /^https?:$/.test(url.protocol) && !url.username && !url.password;
	} catch {
		return false;
	}
}

export function ChatLink(props: ComponentProps<typeof MarkdownLink>) {
	const { t } = useLingui();
	const { openPage, openLink, workspaceId } = useChatPaneActions();
	const openAppLink = useOpenAppLink();
	const isLocalPath = props.href?.startsWith(LOCAL_PATH_PREFIX) ?? false;
	const href = isLocalPath
		? decodeURIComponent(props.href?.slice(LOCAL_PATH_PREFIX.length) ?? "")
		: props.href;

	if (!href) return <MarkdownLink {...props} />;

	const webUrl = env.NEXT_PUBLIC_WEB_URL;
	const appLink = isLocalPath ? null : parseSupersetAppLink(href, webUrl);
	const unfurl = unfurlLink(href, isLocalPath, webUrl);
	const workItem = isLocalPath ? null : parseGithubWorkItemUrl(href);
	const websitePreview = !isLocalPath && !appLink && isWebLink(href);
	const bare =
		typeof props.children === "string" &&
		(props.children === props.href || props.children === href);
	const bareLabel: ReactNode =
		appLink?.kind === "chat" ? (
			t({ message: "Chat" })
		) : appLink?.kind === "environment" ? (
			<EnvironmentLinkLabel environmentId={appLink.environmentId} />
		) : appLink?.kind === "workspace" ? (
			<WorkspaceLinkLabel workspaceId={appLink.workspaceId} />
		) : (
			unfurl?.label
		);
	const children = unfurl ? (
		<>
			<LinkUnfurlIcon icon={unfurl.icon} />
			{bare && bareLabel ? bareLabel : props.children}
		</>
	) : (
		props.children
	);

	const anchor = (
		<MarkdownLink
			{...props}
			title={
				workspaceId && (workItem || websitePreview || appLink?.kind === "chat")
					? undefined
					: href
			}
			data-source-text={isLocalPath || (bare && bareLabel) ? href : undefined}
			className={cn(
				typeof props.className === "string" && props.className,
				unfurl && UNFURLED_LINK_CLASSNAME,
			)}
			onClick={(event) => {
				if (appLink?.kind === "page" && openPage) {
					event.preventDefault();
					openPage(href, event);
					return;
				}
				if (openAppLink(href)) {
					event.preventDefault();
					return;
				}
				if (openLink?.(href, event) || isLocalPath) event.preventDefault();
			}}
		>
			<ChatLinkProvider>{children}</ChatLinkProvider>
		</MarkdownLink>
	);
	if (isLocalPath) {
		return <FileLinkMenu reference={href}>{anchor}</FileLinkMenu>;
	}
	const link = <LinkMenu href={href}>{anchor}</LinkMenu>;
	if (appLink?.kind === "chat") {
		return (
			<ChatPreviewHoverCard
				sessionId={appLink.sessionId}
				workspaceId={appLink.workspaceId}
			>
				{link}
			</ChatPreviewHoverCard>
		);
	}
	if (workItem) {
		return (
			<GithubWorkItemHoverCard link={workItem} url={href}>
				{link}
			</GithubWorkItemHoverCard>
		);
	}
	if (websitePreview) {
		return <WebsiteHoverCard url={href}>{link}</WebsiteHoverCard>;
	}
	return link;
}
