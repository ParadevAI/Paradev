import { useLingui } from "@lingui/react/macro";
import type { AvailableCommand } from "@superset/chat/protocol";
import {
	ChatMarkdown,
	chatMarkdownFirstBlock,
	type RendererProps,
} from "@superset/chat-ui/ChatMarkdown";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { type ComponentProps, type ReactNode, useMemo } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { env } from "renderer/env.renderer";
import {
	linkedContextChip,
	linkedContextData,
} from "renderer/routes/_authenticated/components/AgentComposer/utils/linkedContextChips";
import {
	CHAT_MARKDOWN_COMPONENTS,
	CHAT_REMARK_PLUGINS,
} from "../../../../../../constants";
import { commandChip } from "../../../../../../utils/commandChip";
import { linkChip } from "../../../../../../utils/linkChip";
import type { MessageSegment } from "../../../../../../utils/messageElements";
import { ChatLink } from "../../../../../ChatLink";
import { MessageChip } from "./components/MessageChip";
import { remarkLineBreaks } from "./utils/remarkLineBreaks";
import { remarkTypedMarkers } from "./utils/remarkTypedMarkers";

const CHIP_HREF = "#superset-message-chip-";
const REMARK_PLUGINS = [
	...CHAT_REMARK_PLUGINS,
	remarkTypedMarkers,
	remarkLineBreaks,
];

function segmentChip(
	segment: MessageSegment,
	commands: ReadonlyMap<string, AvailableCommand> | undefined,
	isDark: boolean,
): ComposerChip | null {
	const { element, text } = segment;
	if (!element) return null;
	const linked = linkedContextData(element.data);
	if (linked) return linkedContextChip(linked, isDark);
	if (element.elementKind === "slash_command") {
		const name = text.replace(/^\//, "");
		return {
			...commandChip(name, commands?.get(name)?.description),
			serialized: text,
		};
	}
	return {
		label: element.label ?? text.split("/").pop() ?? text,
		serialized: text,
	};
}

function plainText(children: ReactNode): string | null {
	if (typeof children === "string") return children;
	if (Array.isArray(children) && children.every((c) => typeof c === "string"))
		return children.join("");
	return null;
}

export function UserMessageText({
	commands,
	segments,
}: {
	segments: readonly MessageSegment[];
	commands?: ReadonlyMap<string, AvailableCommand> | undefined;
}) {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	const chatLabel = t({ message: "Chat" });
	const chips = useMemo(
		() => segments.map((segment) => segmentChip(segment, commands, isDark)),
		[segments, commands, isDark],
	);
	const markdown = segments
		.map((segment, index) => {
			const chip = chips[index];
			if (!chip) return segment.text;
			return `[${chip.label.replace(/[\\[\]]/g, "\\$&")}](${CHIP_HREF}${index})`;
		})
		.join("");
	const components = useMemo(
		() => ({
			...CHAT_MARKDOWN_COMPONENTS,
			a: function UserMessageLink(props: RendererProps & ComponentProps<"a">) {
				const { href, children } = props;
				if (href?.startsWith(CHIP_HREF)) {
					const index = Number(href.slice(CHIP_HREF.length));
					const chip = chips[index];
					const source = segments[index]?.text;
					if (chip) {
						return (
							<span
								data-source-text={chip.label === source ? undefined : source}
							>
								<MessageChip chip={chip} />
							</span>
						);
					}
				}
				if (href && plainText(children) === href) {
					const chip = linkChip(href, {
						webUrl: env.NEXT_PUBLIC_WEB_URL,
						isDark,
						chatLabel,
					});
					if (chip) {
						return (
							<span data-source-text={chip.label === href ? undefined : href}>
								<MessageChip chip={chip} link={href} />
							</span>
						);
					}
				}
				return <ChatLink {...props} />;
			},
		}),
		[chips, segments, isDark, chatLabel],
	);
	return (
		<ChatMarkdown
			className={chatMarkdownFirstBlock}
			complete
			components={components}
			remarkPlugins={REMARK_PLUGINS}
		>
			{markdown}
		</ChatMarkdown>
	);
}
