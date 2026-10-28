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
import { parseGithubWorkItemUrl } from "../../../../../../utils/githubWorkItem";
import { linkChip } from "../../../../../../utils/linkChip";
import { unfurlLink } from "../../../../../../utils/linkUnfurl";
import type { MessageSegment } from "../../../../../../utils/messageElements";
import { ChatLink } from "../../../../../ChatLink";
import { LinkPreviewChip } from "./components/LinkPreviewChip";
import { MessageChip } from "./components/MessageChip";
import { findPreviewLink, splitTextLinks } from "./utils/textLinks";

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
	const preview = findPreviewLink(runs.flat(), env.NEXT_PUBLIC_WEB_URL);
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
					const workItem = parseGithubWorkItemUrl(part.url);
					return (
						<span
							data-source-text={
								part === preview ||
								unfurlLink(part.url, false, env.NEXT_PUBLIC_WEB_URL)?.label
									? part.url
									: undefined
							}
							// biome-ignore lint/suspicious/noArrayIndexKey: parts have no identity beyond their order
							key={`${index}:${partIndex}`}
						>
							{workItem ? (
								<MessageChip
									chip={
										linkChip(part.url, {
											webUrl: env.NEXT_PUBLIC_WEB_URL,
											isDark,
											chatLabel,
										}) ?? { label: part.url, serialized: part.url }
									}
									link={part.url}
								/>
							) : part === preview ? (
								<LinkPreviewChip url={part.url} />
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
