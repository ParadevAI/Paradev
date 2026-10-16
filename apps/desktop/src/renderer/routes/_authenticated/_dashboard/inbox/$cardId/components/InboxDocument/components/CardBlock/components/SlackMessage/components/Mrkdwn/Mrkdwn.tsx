import type { ReactNode } from "react";
import {
	type SlackWorkspace,
	useSlackWorkspace,
} from "../../../../providers/SlackWorkspaceProvider";
import { EmojiGlyph } from "../EmojiGlyph";
import { MentionChip } from "../MentionChip";
import { PersonMention } from "../PersonMention";
import { SlackLink } from "../SlackLink";

type MrkdwnContext = SlackWorkspace;

interface MrkdwnProps {
	text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">" };

function decodeEntities(text: string): string {
	return text.replace(/&(amp|lt|gt);/g, (_, name: string) => ENTITIES[name]);
}

const INLINE =
	/```([\s\S]*?)```|`([^`\n]+)`|<([^>|]+)(?:\|([^>]*))?>|\*([^*\n]+)\*|(?<!\\)_([^_\n]+)_|~([^~\n]+)~|:([a-z0-9_+-]+):|\n{2,}|\n/g;

/**
 * Slack mrkdwn to React, with the subset Slack itself renders in messages:
 * bold, italic, strike, code, code blocks, links, user and channel mentions,
 * broadcasts and emoji. Anything else is text.
 */
function renderMrkdwn(text: string, ctx: MrkdwnContext): ReactNode[] {
	const out: ReactNode[] = [];
	let last = 0;
	let key = 0;
	const push = (node: ReactNode) => out.push(<span key={key++}>{node}</span>);
	const plain = (chunk: string) => {
		if (chunk) out.push(decodeEntities(chunk.replace(/\\_/g, "_")));
	};
	for (const match of text.matchAll(INLINE)) {
		const index = match.index ?? 0;
		plain(text.slice(last, index));
		last = index + match[0].length;
		const [
			whole,
			codeBlock,
			code,
			angle,
			angleLabel,
			bold,
			italic,
			strike,
			emojiName,
		] = match;
		if (whole === "\n") {
			out.push(<br key={key++} />);
		} else if (whole.startsWith("\n")) {
			out.push(<span key={key++} className="block h-2" />);
		} else if (codeBlock !== undefined) {
			out.push(
				<pre
					key={key++}
					className="my-1 overflow-x-auto rounded-md border border-border bg-muted/60 px-3 py-2 font-mono text-xs"
				>
					{decodeEntities(codeBlock.replace(/^\n/, ""))}
				</pre>,
			);
		} else if (code !== undefined) {
			out.push(
				<code
					key={key++}
					className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-warning"
				>
					{decodeEntities(code)}
				</code>,
			);
		} else if (angle !== undefined) {
			out.push(renderAngle(angle, angleLabel, ctx, key++));
		} else if (bold !== undefined) {
			push(<b className="font-semibold">{renderMrkdwn(bold, ctx)}</b>);
		} else if (italic !== undefined) {
			push(<i>{renderMrkdwn(italic, ctx)}</i>);
		} else if (strike !== undefined) {
			push(<s>{renderMrkdwn(strike, ctx)}</s>);
		} else if (emojiName !== undefined) {
			out.push(<EmojiGlyph key={key++} name={emojiName} emoji={ctx.emoji} />);
		}
	}
	plain(text.slice(last));
	return out;
}

function renderAngle(
	body: string,
	label: string | undefined,
	ctx: MrkdwnContext,
	key: number,
): ReactNode {
	if (body.startsWith("@")) {
		return <PersonMention key={key} id={body.slice(1)} label={label} />;
	}
	if (body.startsWith("#")) {
		const id = body.slice(1);
		return (
			<MentionChip
				key={key}
				prefix="#"
				label={label || ctx.channels[id] || id}
			/>
		);
	}
	if (body.startsWith("!subteam^")) {
		const id = body.slice("!subteam^".length);
		return (
			<MentionChip
				key={key}
				prefix="@"
				label={label?.replace(/^@/, "") || ctx.groups[id] || id}
			/>
		);
	}
	if (body.startsWith("!")) {
		return (
			<MentionChip
				key={key}
				prefix="@"
				label={label || body.slice(1).split("^")[0] || ""}
			/>
		);
	}
	const href = decodeEntities(body);
	return (
		<SlackLink key={key} href={href}>
			{label && label !== body ? decodeEntities(label) : undefined}
		</SlackLink>
	);
}

/**
 * Slack mrkdwn as Slack renders it in a message: bold, italic, strike,
 * code, code blocks, links, user and channel mentions, broadcasts and
 * emoji. Anything else is text.
 */
export function Mrkdwn({ text }: MrkdwnProps) {
	return <>{renderMrkdwn(text, useSlackWorkspace())}</>;
}
