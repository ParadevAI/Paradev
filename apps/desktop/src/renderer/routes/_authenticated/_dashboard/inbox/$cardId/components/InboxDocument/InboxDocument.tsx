import { Trans } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { Checkbox } from "@superset/ui/checkbox";
import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	LuInfo,
	LuMessageCircleQuestion,
	LuTriangleAlert,
} from "react-icons/lu";
import { AskBlock } from "./components/AskBlock";
import { CardBlock } from "./components/CardBlock";
import type { CardInput } from "./components/CardBlock/types";
import { FocusFrame } from "./components/FocusFrame";
import { RichText } from "./components/RichText";
import { SettledLine } from "./components/SettledLine";
import { enterFocusedBlock, useBlockKeys } from "./hooks/useBlockKeys";
import { focusUnits, resolveFocus, stepFocus } from "./utils/focusChain";

type Document = RouterOutputs["inbox"]["document"];
type Block = NonNullable<Document["blocks"]>[number];

interface InboxDocumentProps {
	document: Document;
	done: boolean;
	pending: boolean;
	/** The card action that last failed, shown on its own block. */
	failure: { blockId: string; message: string } | null;
	onAnswer: (questionId: string, value: unknown) => void;
	onSkip: (questionId: string) => void;
	onAct: (
		blockId: string,
		actionId: string,
		input?: CardInput,
		confirm?: string,
	) => void;
	onConnect: (href: string) => void;
}

/**
 * Draws the agent's document natively. Prose blocks are the agent's own words
 * (zone 3); `card` blocks were rendered by the API for this reader (zone 2);
 * `ask` blocks are the questions the reader answers here.
 */
export function InboxDocument({
	document,
	done,
	pending,
	failure,
	onAnswer,
	onSkip,
	onAct,
	onConnect,
}: InboxDocumentProps) {
	const blocks = document.blocks ?? [];
	const askInCard = embeddedAsks(blocks);
	const units = useMemo(() => focusUnits(document.blocks ?? []), [document]);
	const settled = {
		blocks: document.settled.blocks,
		answers: document.answers ?? {},
		skipped: document.settled.skipped,
	};
	const [wanted, setWanted] = useState<string | null>(null);
	const focus = done ? null : resolveFocus(units, settled, wanted);
	const entering = useRef<"first" | "last" | null>(null);
	useBlockKeys({
		enabled: focus !== null,
		onStep: (step) => {
			const next = stepFocus(units, settled, focus, step);
			if (next === null || next === focus) return false;
			entering.current = step === 1 ? "first" : "last";
			setWanted(next);
			return true;
		},
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when Tab moved the card's focus to another block
	useEffect(() => {
		if (entering.current) enterFocusedBlock(entering.current);
		entering.current = null;
	}, [focus]);

	return (
		<div className="flex flex-col gap-3">
			{groupLists(blocks).map((group) =>
				group.kind === "list" ? (
					group.ordered ? (
						<ol
							key={group.key}
							className="flex list-decimal flex-col gap-1 pl-6 text-sm leading-relaxed text-foreground marker:text-muted-foreground"
						>
							{group.items.map((b) => (
								<li key={b.id}>
									<RichText spans={richText(b)} />
								</li>
							))}
						</ol>
					) : (
						<ul
							key={group.key}
							className="flex list-disc flex-col gap-1 pl-6 text-sm leading-relaxed text-foreground marker:text-muted-foreground"
						>
							{group.items.map((b) => (
								<li key={b.id}>
									<RichText spans={richText(b)} />
								</li>
							))}
						</ul>
					)
				) : (
					<BlockView
						key={group.block.id}
						block={group.block}
						askInCard={askInCard}
						document={document}
						done={done}
						pending={pending}
						failure={failure}
						focus={focus}
						onFocus={setWanted}
						onAnswer={onAnswer}
						onSkip={onSkip}
						onAct={onAct}
						onConnect={onConnect}
					/>
				),
			)}
		</div>
	);
}

/**
 * Ask blocks a card answers in place: an agent-needs card names the question,
 * so the question renders inside the card and not again below it.
 */
function embeddedAsks(
	blocks: Block[],
): Map<string, Extract<Block, { type: "ask" }>> {
	const byCard = new Map<string, Extract<Block, { type: "ask" }>>();
	for (const block of blocks) {
		if (block.type !== "card") continue;
		const view = block.resolved.view;
		if (view?.kind !== "superset.agent_needs" || !view.questionId) continue;
		const ask = blocks.find(
			(candidate): candidate is Extract<Block, { type: "ask" }> =>
				candidate.type === "ask" &&
				candidate.ask.questions.some((q) => q.id === view.questionId),
		);
		if (ask) byCard.set(block.id, ask);
	}
	return byCard;
}

function BlockView({
	block,
	askInCard,
	document,
	done,
	pending,
	failure,
	focus,
	onFocus,
	onAnswer,
	onSkip,
	onAct,
	onConnect,
}: {
	block: Block;
	askInCard: Map<string, Extract<Block, { type: "ask" }>>;
	focus: string | null;
	onFocus: (unitKey: string) => void;
} & InboxDocumentProps) {
	const askBlock = (ask: Extract<Block, { type: "ask" }>) => (
		<AskBlock
			block={ask}
			answers={document.answers ?? {}}
			skipped={document.settled.skipped}
			done={done}
			pending={pending}
			focusedId={focus?.startsWith("question:") ? focus.slice(9) : null}
			onFocus={(questionId) => onFocus(`question:${questionId}`)}
			onAnswer={onAnswer}
			onSkip={onSkip}
		/>
	);
	switch (block.type) {
		case "paragraph":
			return (
				<p className="text-sm leading-relaxed text-foreground">
					<RichText spans={block.paragraph.rich_text} />
				</p>
			);
		case "heading_1":
			return (
				<h2 className="mt-4 text-xl font-semibold leading-tight tracking-tight">
					<RichText spans={block.heading_1.rich_text} />
				</h2>
			);
		case "heading_2":
			return (
				<h3 className="mt-3 text-base font-semibold leading-snug">
					<RichText spans={block.heading_2.rich_text} />
				</h3>
			);
		case "heading_3":
			return (
				<h4 className="mt-2 text-sm font-semibold leading-snug">
					<RichText spans={block.heading_3.rich_text} />
				</h4>
			);
		case "callout": {
			const icon = block.callout.icon ?? "info";
			return (
				<div
					className={cn(
						"flex gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed",
						icon === "warning"
							? "border-warning/40 bg-warning/10"
							: "border-border bg-card",
					)}
				>
					{icon === "why" ? (
						<LuMessageCircleQuestion
							className="mt-0.5 size-4 shrink-0 text-muted-foreground"
							strokeWidth={1.5}
						/>
					) : icon === "warning" ? (
						<LuTriangleAlert
							className="mt-0.5 size-4 shrink-0 text-warning"
							strokeWidth={1.5}
						/>
					) : (
						<LuInfo
							className="mt-0.5 size-4 shrink-0 text-muted-foreground"
							strokeWidth={1.5}
						/>
					)}
					<RichText spans={block.callout.rich_text} />
				</div>
			);
		}
		case "quote":
			return (
				<blockquote className="border-l-2 border-border pl-4 text-sm italic leading-relaxed text-muted-foreground">
					<RichText spans={block.quote.rich_text} />
				</blockquote>
			);
		case "to_do":
			return (
				<div className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground">
					<Checkbox checked={block.to_do.checked} disabled className="mt-1" />
					<RichText
						spans={block.to_do.rich_text}
						className={cn(
							block.to_do.checked && "text-muted-foreground line-through",
						)}
					/>
				</div>
			);
		case "code":
			return (
				<pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
					<code>{block.code.content}</code>
				</pre>
			);
		case "divider":
			return <hr className="my-2 border-border" />;
		case "card": {
			const ask = askInCard.get(block.id);
			const outcome = document.settled.blocks[block.id];
			const key = `card:${block.id}`;
			const card = (
				<CardBlock
					block={block}
					ask={ask ? askBlock(ask) : undefined}
					done={done || outcome !== undefined}
					pending={pending}
					failure={failure?.blockId === block.id ? failure.message : null}
					focused={focus === key}
					onAct={(actionId, input, confirm) =>
						onAct(block.id, actionId, input, confirm)
					}
					onConnect={onConnect}
				/>
			);
			if (outcome)
				return (
					<SettledLine
						label={block.resolved.title}
						outcome={
							outcome.notice ??
							block.resolved.actions.find(
								(action) => action.id === outcome.action,
							)?.label ??
							outcome.action
						}
					>
						{card}
					</SettledLine>
				);
			if (done || !block.actionable) return card;
			return (
				<FocusFrame
					unitKey={key}
					focused={focus === key}
					onFocus={() => onFocus(key)}
				>
					{card}
				</FocusFrame>
			);
		}
		case "ask":
			if ([...askInCard.values()].some((embedded) => embedded.id === block.id))
				return null;
			return askBlock(block);
		default:
			return (
				<p className="text-xs text-muted-foreground">
					<Trans>This block needs a newer version of the app.</Trans>
				</p>
			);
	}
}

type ListBlock = Extract<
	Block,
	{ type: "bulleted_list_item" | "numbered_list_item" }
>;

function richText(b: ListBlock) {
	return b.type === "bulleted_list_item"
		? b.bulleted_list_item.rich_text
		: b.numbered_list_item.rich_text;
}

type Group =
	| { kind: "list"; key: string; ordered: boolean; items: ListBlock[] }
	| { kind: "block"; block: Block };

/** Adjacent list items become one list, the way every block editor renders them. */
function groupLists(blocks: Block[]): Group[] {
	const out: Group[] = [];
	for (const block of blocks) {
		if (
			block.type === "bulleted_list_item" ||
			block.type === "numbered_list_item"
		) {
			const ordered = block.type === "numbered_list_item";
			const last = out[out.length - 1];
			if (last && last.kind === "list" && last.ordered === ordered) {
				last.items.push(block);
			} else {
				out.push({ kind: "list", key: block.id, ordered, items: [block] });
			}
		} else {
			out.push({ kind: "block", block });
		}
	}
	return out;
}
