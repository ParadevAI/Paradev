import { useLingui } from "@lingui/react/macro";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { type ReactNode, useCallback } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { env } from "renderer/env.renderer";
import { parseGithubWorkItemUrl } from "../../../../utils/githubWorkItem";
import { linkChip, linkOfChip } from "../../../../utils/linkChip";
import { parseSupersetAppLink } from "../../../../utils/supersetAppLink";
import { ChatPreviewHoverCard } from "../../../ChatPreviewHoverCard";
import { GithubWorkItemHoverCard } from "../../../GithubWorkItemHoverCard";
import { WebsiteHoverCard } from "../../../WebsiteHoverCard";

const WEB_URL = env.NEXT_PUBLIC_WEB_URL;

/**
 * Links in the composer: a pasted link becomes a named chip with its app's
 * icon, and gets the same hover card it would have in the transcript.
 */
export function useLinkChips() {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	const chatLabel = t({ message: "Chat" });

	const chipForPaste = useCallback(
		(text: string) => linkChip(text, { webUrl: WEB_URL, isDark, chatLabel }),
		[isDark, chatLabel],
	);

	const renderChip = useCallback((chip: ComposerChip, rendered: ReactNode) => {
		const link = linkOfChip(chip);
		if (!link) return null;
		const workItem = parseGithubWorkItemUrl(link);
		if (workItem) {
			return (
				<GithubWorkItemHoverCard link={workItem}>
					<span>{rendered}</span>
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
					<span>{rendered}</span>
				</ChatPreviewHoverCard>
			);
		}
		if (app) return null;
		return (
			<WebsiteHoverCard url={link}>
				<span>{rendered}</span>
			</WebsiteHoverCard>
		);
	}, []);

	return { chipForPaste, renderChip };
}
