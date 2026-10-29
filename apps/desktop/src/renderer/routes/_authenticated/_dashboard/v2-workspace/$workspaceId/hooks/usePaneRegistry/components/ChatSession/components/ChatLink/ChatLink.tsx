import { useLingui } from "@lingui/react/macro";
import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import { type UseNavigateResult, useNavigate } from "@tanstack/react-router";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { env } from "renderer/env.renderer";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { ChatLinkProvider } from "../../providers/ChatLinkProvider";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { parseGithubWorkItemUrl } from "../../utils/githubWorkItem";
import { unfurlLink } from "../../utils/linkUnfurl";
import { LOCAL_PATH_PREFIX } from "../../utils/remarkLocalPathLinks";
import {
	parseSupersetAppLink,
	type SupersetAppLink,
} from "../../utils/supersetAppLink";
import { ChatPreviewHoverCard } from "../ChatPreviewHoverCard";
import { FileLinkMenu } from "../FileLinkMenu";
import { GithubWorkItemHoverCard } from "../GithubWorkItemHoverCard";
import { LinkMenu } from "../LinkMenu";
import { WebsiteHoverCard } from "../WebsiteHoverCard";
import { EnvironmentLinkLabel } from "./components/EnvironmentLinkLabel";
import { LinkUnfurlIcon } from "./components/LinkUnfurlIcon";

const MarkdownLink = chatMarkdownComponents.a;
const UNFURLED_LINK_CLASSNAME =
	"rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-foreground no-underline box-decoration-clone transition-colors hover:bg-foreground/[0.12] hover:text-foreground hover:no-underline";

function openInApp(
	link: Exclude<SupersetAppLink, { kind: "page" }>,
	navigate: UseNavigateResult<string>,
): void {
	switch (link.kind) {
		case "task":
			void navigate({ to: "/tasks/$taskId", params: { taskId: link.taskId } });
			return;
		case "automation":
			void navigate({
				to: "/automations/$automationId",
				params: { automationId: link.automationId },
			});
			return;
		case "plugin":
			void navigate({
				to: "/plugins/$pluginName",
				params: { pluginName: link.pluginName },
			});
			return;
		case "environment":
			void navigate({
				to: "/environments/$environmentId",
				params: { environmentId: link.environmentId },
			});
			return;
		case "workspace":
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: link.workspaceId },
			});
			return;
		case "chat":
			void navigateToV2Workspace(link.workspaceId, navigate, {
				search: {
					sessionId: link.sessionId,
					focusRequestId: crypto.randomUUID(),
				},
			});
	}
}

function isWebLink(href: string): boolean {
	try {
		const url = new URL(href);
		return /^https?:$/.test(url.protocol) && !url.username && !url.password;
	} catch {
		return false;
	}
}

function withModifier(event: MouseEvent): boolean {
	return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function ChatLink(props: ComponentProps<typeof MarkdownLink>) {
	const { t } = useLingui();
	const { openPage, openLink, workspaceId } = useChatPaneActions();
	const navigate = useNavigate();
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
				if (appLink && appLink.kind !== "page" && !withModifier(event)) {
					event.preventDefault();
					openInApp(appLink, navigate);
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
