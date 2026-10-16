import type { AvailableCommand } from "@superset/chat/protocol";
import { Chip } from "@superset/chat-ui/Chip";
import { env } from "renderer/env.renderer";
import { commandChip } from "../../../../../../utils/commandChip";
import { parseGithubWorkItemUrl } from "../../../../../../utils/githubWorkItem";
import { unfurlLink } from "../../../../../../utils/linkUnfurl";
import type { MessageSegment } from "../../../../../../utils/messageElements";
import { ChatLink } from "../../../../../ChatLink";
import { GithubWorkItemChip } from "./components/GithubWorkItemChip";
import { LinkPreviewChip } from "./components/LinkPreviewChip";
import { findPreviewLink, splitTextLinks } from "./utils/textLinks";

function segmentChip(
	segment: MessageSegment,
	commands: ReadonlyMap<string, AvailableCommand> | undefined,
) {
	const { element, text } = segment;
	if (!element) return null;
	if (element.elementKind === "slash_command" && text.startsWith("/")) {
		const name = text.slice(1);
		return commandChip(name, commands?.get(name)?.description);
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
	const runs = segments.map((segment) =>
		segment.element ? [] : splitTextLinks(segment.text),
	);
	const preview = findPreviewLink(runs.flat(), env.NEXT_PUBLIC_WEB_URL);
	return (
		<span>
			{segments.map((segment, index) => {
				const chip = segmentChip(segment, commands);
				if (chip) {
					return (
						<span
							data-source-text={
								chip.label === segment.text ? undefined : segment.text
							}
							// biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity beyond their order
							key={index}
						>
							<Chip chip={chip} />
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
								<GithubWorkItemChip link={workItem} url={part.url} />
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
