import { cn } from "@superset/ui/utils";
import { Fragment, type ReactNode } from "react";
import { useSlackWorkspace } from "../../../../providers/SlackWorkspaceProvider";
import type { SlackBlockView } from "../../types";
import { EmojiGlyph } from "../EmojiGlyph";
import { MentionChip } from "../MentionChip";
import { PersonMention } from "../PersonMention";
import { SlackLink } from "../SlackLink";

type RichText = Extract<SlackBlockView, { type: "rich_text" }>;
type Element = RichText["elements"][number];
type Inline = Extract<Element, { kind: "section" }>["inline"][number];

interface RichTextBlockProps {
	block: RichText;
}

const BULLETS = ["•", "◦", "▪"];

/** Line breaks as Slack shows them: a blank line is a short gap, not a full empty line. */
function withBreaks(text: string): ReactNode {
	return text.split(/\n{2,}/).map((paragraph, p) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of one run never reorder
		<Fragment key={p}>
			{p > 0 && <span aria-hidden className="block h-2" />}
			{paragraph.split("\n").map((line, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: lines of one paragraph never reorder
				<Fragment key={i}>
					{i > 0 && <br />}
					{line}
				</Fragment>
			))}
		</Fragment>
	));
}

function marked(
	run: { bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean },
	node: ReactNode,
) {
	let out = node;
	if (run.code)
		out = (
			<code className="rounded-[3px] border border-border bg-muted px-1 py-px font-mono text-[0.85em] text-warning">
				{out}
			</code>
		);
	if (run.strike) out = <s>{out}</s>;
	if (run.italic) out = <i>{out}</i>;
	if (run.bold) out = <b className="font-bold">{out}</b>;
	return out;
}

function Runs({ inline }: { inline: Inline[] }) {
	const { channels, groups, emoji } = useSlackWorkspace();
	return (
		<>
			{inline.map((run, i) => {
				const key = `${run.kind}-${i}`;
				switch (run.kind) {
					case "text":
						return (
							<Fragment key={key}>{marked(run, withBreaks(run.text))}</Fragment>
						);
					case "link":
						return (
							<Fragment key={key}>
								{marked(
									run,
									<SlackLink href={run.url}>{run.text ?? undefined}</SlackLink>,
								)}
							</Fragment>
						);
					case "user":
						return <PersonMention key={key} id={run.id} />;
					case "channel":
						return (
							<MentionChip
								key={key}
								prefix="#"
								label={channels[run.id] ?? run.id}
							/>
						);
					case "usergroup":
						return (
							<MentionChip
								key={key}
								prefix="@"
								label={groups[run.id] ?? run.id}
							/>
						);
					case "broadcast":
						return <MentionChip key={key} prefix="@" label={run.range} />;
					case "emoji":
						return run.unicode && !emoji[run.name] ? (
							<EmojiGlyph key={key} name={run.name} emoji={{}} />
						) : (
							<EmojiGlyph key={key} name={run.name} emoji={emoji} />
						);
					case "date":
						return <Fragment key={key}>{run.text}</Fragment>;
					default:
						return null;
				}
			})}
		</>
	);
}

/**
 * Slack's rich_text block: what a person's message is really made of. The
 * plain `text` beside it is only Slack's notification fallback, so this is
 * what Slack draws.
 */
export function RichTextBlock({ block }: RichTextBlockProps) {
	return (
		<div className="flex flex-col gap-1">
			{block.elements.map((element: Element, i) => {
				const key = `${element.kind}-${i}`;
				switch (element.kind) {
					case "section":
						return (
							<div key={key} className="whitespace-pre-wrap">
								<Runs inline={element.inline} />
							</div>
						);
					case "preformatted":
						return (
							<pre
								key={key}
								className="overflow-x-auto rounded-md border border-border bg-muted/60 px-3 py-2 font-mono text-xs whitespace-pre-wrap"
							>
								<Runs inline={element.inline} />
							</pre>
						);
					case "quote":
						return (
							<blockquote
								key={key}
								className="border-l-4 border-border pl-3 text-foreground"
							>
								<Runs inline={element.inline} />
							</blockquote>
						);
					case "list": {
						const List = element.ordered ? "ol" : "ul";
						return (
							<List
								key={key}
								className={cn("flex flex-col")}
								style={{ paddingLeft: 22 + element.indent * 22 }}
							>
								{element.items.map((item, n) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: list items keep Slack's order
									<li key={n} className="relative whitespace-pre-wrap">
										<span className="absolute -left-[18px] w-4 text-center select-none">
											{element.ordered
												? `${n + 1}.`
												: BULLETS[element.indent % BULLETS.length]}
										</span>
										<Runs inline={item} />
									</li>
								))}
							</List>
						);
					}
					default:
						return null;
				}
			})}
		</div>
	);
}
