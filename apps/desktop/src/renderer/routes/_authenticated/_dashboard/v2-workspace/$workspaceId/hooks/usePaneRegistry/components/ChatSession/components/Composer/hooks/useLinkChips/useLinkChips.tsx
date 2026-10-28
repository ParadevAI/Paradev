import { useLingui } from "@lingui/react/macro";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { type ReactNode, useCallback } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { env } from "renderer/env.renderer";
import { linkChip, linkOfChip } from "../../../../utils/linkChip";
import { LinkHoverCard } from "../../../LinkHoverCard";

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
		return (
			<LinkHoverCard link={link}>
				<span>{rendered}</span>
			</LinkHoverCard>
		);
	}, []);

	return { chipForPaste, renderChip };
}
