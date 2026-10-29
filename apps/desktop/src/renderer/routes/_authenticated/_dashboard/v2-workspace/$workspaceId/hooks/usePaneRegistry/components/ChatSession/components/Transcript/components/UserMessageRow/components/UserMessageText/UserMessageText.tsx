import { useLingui } from "@lingui/react/macro";
import type { AvailableCommand } from "@superset/chat/protocol";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { env } from "renderer/env.renderer";
import {
	linkedContextChip,
	linkedContextData,
} from "renderer/routes/_authenticated/components/AgentComposer/utils/linkedContextChips";
import { commandChip } from "../../../../../../utils/commandChip";
import { linkChip } from "../../../../../../utils/linkChip";
import type { MessageSegment } from "../../../../../../utils/messageElements";
import { ChatLink } from "../../../../../ChatLink";
import { MessageChip } from "./components/MessageChip";
import { splitTextLinks } from "./utils/textLinks";

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
	const runs = segments.map((segment) =>
		segment.element ? [] : splitTextLinks(segment.text),
	);
	return (
		<span>
			{segments.map((segment, index) => {
				const chip = segmentChip(segment, commands, isDark);
				if (chip) {
					return (
						<span
							data-source-text={
								chip.label === segment.text ? undefined : segment.text
							}
							// biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity beyond their order
							key={index}
						>
							<MessageChip chip={chip} />
						</span>
					);
				}
				return runs[index]?.map((part, partIndex) => {
					if (part.kind === "text") return part.text;
					const chip = linkChip(part.url, {
						webUrl: env.NEXT_PUBLIC_WEB_URL,
						isDark,
						chatLabel,
					});
					return (
						<span
							data-source-text={
								chip && chip.label !== part.url ? part.url : undefined
							}
							// biome-ignore lint/suspicious/noArrayIndexKey: parts have no identity beyond their order
							key={`${index}:${partIndex}`}
						>
							{chip ? (
								<MessageChip chip={chip} link={part.url} />
							) : (
								<ChatLink href={part.url}>{part.url}</ChatLink>
							)}
						</span>
					);
				});
			})}
		</span>
	);
}
