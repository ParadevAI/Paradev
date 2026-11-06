import type { ChatMarkdownProps } from "@superset/chat-ui/ChatMarkdown";
import { type ComponentProps, useMemo } from "react";
import { ChatLink } from "../../components/ChatLink";
import { CHAT_MARKDOWN_COMPONENTS, CHAT_REMARK_PLUGINS } from "../../constants";
import { useTranscriptCards } from "../../providers/TranscriptCardsProvider";

type RemarkPlugins = NonNullable<ChatMarkdownProps["remarkPlugins"]>;

/**
 * How a transcript renders markdown: the chat's own plugins and renderers,
 * plus what the screen around it adds, such as the names it shows as mentions.
 */
export function useTranscriptMarkdown(
	basePlugins: RemarkPlugins = CHAT_REMARK_PLUGINS,
) {
	const { markdown } = useTranscriptCards();
	return useMemo(() => {
		if (!markdown) {
			return {
				components: CHAT_MARKDOWN_COMPONENTS,
				remarkPlugins: basePlugins,
				renderLink: undefined,
			};
		}
		const { renderLink } = markdown;
		return {
			components: {
				...CHAT_MARKDOWN_COMPONENTS,
				a: function TranscriptLink(props: ComponentProps<typeof ChatLink>) {
					return (
						(props.href && renderLink(props.href, props.children)) || (
							<ChatLink {...props} />
						)
					);
				},
			},
			remarkPlugins: [...basePlugins, ...markdown.remarkPlugins],
			renderLink,
		};
	}, [markdown, basePlugins]);
}
