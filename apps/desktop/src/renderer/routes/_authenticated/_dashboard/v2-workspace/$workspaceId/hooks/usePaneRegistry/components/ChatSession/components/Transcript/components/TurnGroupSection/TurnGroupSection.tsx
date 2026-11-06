import { useLingui } from "@lingui/react/macro";
import type { OutboxEntry, SessionSnapshot } from "@superset/chat/core";
import { approvalAsker, displayText } from "@superset/chat/core";
import type {
	ApprovalRequest,
	AvailableCommand,
	Decision,
	Item,
	ToolCall,
	UserMessage,
} from "@superset/chat/protocol";
import { isImageAttachment } from "@superset/chat/protocol";
import { Fragment, type ReactNode } from "react";
import {
	type TranscriptCardRef,
	useTranscriptCards,
} from "../../../../providers/TranscriptCardsProvider";
import type { ChatForkTarget } from "../../../../types";
import type { PageLink } from "../../../../utils/pageLinks";
import { PageLinkCard } from "../../../PageLinkCard";
import type { Speaker } from "../../utils/speakerStarts";
import type { TranscriptRow } from "../../utils/transcriptRows";
import { AttachmentRail, type RailImage } from "../AttachmentRail";
import { ReplyFooter } from "../ReplyFooter";
import { SpeakerHeader } from "../SpeakerHeader";
import { ItemRow } from "./components/ItemRow";
import { ToolRunRow } from "./components/ToolRunRow";
import { TurnChangesCard } from "./components/TurnChangesCard";
import { TurnStatusRow } from "./components/TurnStatusRow";
import { Work } from "./components/Work";
import { WorkingFor } from "./components/WorkingFor";

function outboxMessage(entry: OutboxEntry): UserMessage {
	return {
		id: entry.clientId,
		kind: "user_message",
		clientId: entry.clientId,
		startedAtMs: 0,
		content: entry.content,
	};
}

function pageCards(pages: readonly PageLink[] | undefined): ReactNode {
	return pages?.map((page) => (
		<PageLinkCard
			className="mt-1 mb-1.5"
			key={page.slug}
			slug={page.slug}
			url={page.url}
		/>
	));
}

function toolImages(tools: readonly ToolCall[]): RailImage[] {
	return tools.flatMap((tool) =>
		(tool.attachments ?? [])
			.filter(isImageAttachment)
			.map((image) => ({ owner: tool.id, image })),
	);
}

function imageRail(tools: readonly ToolCall[]): ReactNode {
	const images = toolImages(tools);
	return images.length > 0 ? (
		<AttachmentRail className="mt-1 mb-2 pl-5" images={images} />
	) : null;
}

function approvalTarget(
	snapshot: SessionSnapshot,
	item: Item,
): Item | undefined {
	if (item.kind !== "approval_request") return undefined;
	const targetId = (item as ApprovalRequest).targetItemId;
	return targetId ? snapshot.items.get(targetId)?.item : undefined;
}

export type TurnGroupSectionProps = {
	row: TranscriptRow;
	lastReply: boolean;
	snapshot: SessionSnapshot;
	childrenByParent: ReadonlyMap<string, readonly Item[]>;
	isEntryCollapsed: (entryKey: string, defaultCollapsed: boolean) => boolean;
	onToggleEntry: (entryKey: string, collapsed: boolean) => void;
	onRespond: (approvalId: string, decision: Decision) => void;
	onRetryPrompt: (clientId: string) => void;
	onDiscardPrompt: (clientId: string) => void;
	onFork?: ((target: ChatForkTarget) => void) | undefined;
	canForkToWorktree?: boolean;
	commands?: ReadonlyMap<string, AvailableCommand> | undefined;
	/** This row begins a run of one speaker, so their face, name and time go above it. */
	speaker?: Speaker | undefined;
	speakerAt?: number | null | undefined;
	speakerNewDay?: boolean | undefined;
};

/**
 * One row of a turn group: the turn's working line, a message, a run of tool
 * calls, or how the turn ended. The transcript renders the rows of every
 * group as one flat list, so a message keeps its DOM node from sending
 * through its turn.
 */
export function TurnGroupSection({
	canForkToWorktree,
	childrenByParent,
	commands,
	lastReply,
	isEntryCollapsed,
	onDiscardPrompt,
	onFork,
	onRespond,
	onRetryPrompt,
	onToggleEntry,
	row,
	snapshot,
	speaker,
	speakerAt,
	speakerNewDay,
}: TurnGroupSectionProps) {
	const { t } = useLingui();
	const { renderCard, quietTools, keepOut, speakers } = useTranscriptCards();
	const cardNodes = (
		cards: readonly TranscriptCardRef[] | undefined,
		folded = false,
	) =>
		cards
			?.filter((card) => !folded || (keepOut?.(card) ?? true))
			.map((card) => (
				<Fragment key={card.key}>{renderCard(card, "mt-1 mb-1.5")}</Fragment>
			));
	const harness = snapshot.session?.harness;
	const body = ((): ReactNode => {
		switch (row.kind) {
			case "working":
				if (row.folded && row.foldKey && isEntryCollapsed(row.foldKey, true)) {
					return null;
				}
				return (
					<Work folded={row.folded}>
						<WorkingFor
							completedAtMs={row.completedAtMs}
							startedAtMs={row.startedAtMs}
							waiting={row.waiting}
							{...(row.foldable
								? {
										expanded: !isEntryCollapsed(row.key, true),
										onToggle: () =>
											onToggleEntry(row.key, !isEntryCollapsed(row.key, true)),
									}
								: {})}
						/>
					</Work>
				);
			case "item": {
				if (row.folded && row.foldKey && isEntryCollapsed(row.foldKey, true)) {
					return row.cards?.length ? cardNodes(row.cards, true) : null;
				}
				if (quietTools && row.item.kind === "tool_call" && row.cards?.length) {
					return <Work folded={row.folded}>{cardNodes(row.cards)}</Work>;
				}
				const asker = approvalAsker(snapshot.items, row.item);
				// A reply whose options became a card says the question once: the
				// card carries the options, the text stops where the list began.
				const asked = row.cards?.find(
					(card) => card.kind === "decision" && card.intro !== undefined,
				);
				return (
					<Work folded={row.folded}>
						<ItemRow
							afterTarget={row.afterTarget}
							approvalTarget={approvalTarget(snapshot, row.item)}
							asker={
								asker ? asker.title || t({ message: "Subagent" }) : undefined
							}
							canForkToWorktree={canForkToWorktree}
							childItems={childrenByParent.get(row.item.id)}
							commands={commands}
							lastReply={lastReply}
							harness={harness}
							item={row.item}
							onFork={onFork}
							onRespond={onRespond}
							pagesShownEarlier={row.pagesShownEarlier}
							text={
								asked?.kind === "decision" && asked.intro
									? asked.intro
									: displayText(snapshot, row.item.id)
							}
						/>
						{row.item.kind === "tool_call" && imageRail([row.item as ToolCall])}
						{pageCards(row.pages)}
						{cardNodes(row.cards)}
					</Work>
				);
			}
			case "outbox":
				return (
					<ItemRow
						commands={commands}
						harness={harness}
						item={outboxMessage(row.entry)}
						onRespond={onRespond}
						pending={{
							failed: row.entry.state === "failed",
							onRetry: () => onRetryPrompt(row.entry.clientId),
							onDiscard: () => onDiscardPrompt(row.entry.clientId),
						}}
						text=""
					/>
				);
			case "tool_run":
				if (row.folded && row.foldKey && isEntryCollapsed(row.foldKey, true)) {
					return row.cards?.length ? cardNodes(row.cards, true) : null;
				}
				if (
					quietTools &&
					row.cards?.length &&
					row.cardToolCount === row.items.length &&
					!row.active
				) {
					return <Work folded={row.folded}>{cardNodes(row.cards)}</Work>;
				}
				return (
					<Work folded={row.folded}>
						<ToolRunRow
							active={row.active === true}
							childLists={row.items.map((tool) =>
								childrenByParent.get(tool.id),
							)}
							collapsed={isEntryCollapsed(row.key, row.defaultCollapsed)}
							items={row.items}
							onToggle={onToggleEntry}
							rowKey={row.key}
							steps={row.steps}
							stepTexts={row.steps.map((step) =>
								step.kind === "reasoning" ? displayText(snapshot, step.id) : "",
							)}
						/>
						{imageRail(row.items)}
						{pageCards(row.pages)}
						{cardNodes(row.cards)}
					</Work>
				);
			case "turn_status":
				return (
					<TurnStatusRow
						error={row.error}
						latest={row.latest}
						status={row.status}
						turnId={row.turnId}
					/>
				);
			case "changed_files":
				return (
					<TurnChangesCard
						files={row.files}
						newest={row.newest}
						toolCallIds={row.toolCallIds}
						turnId={row.turnId}
					/>
				);
			case "reply_footer":
				return (
					<ReplyFooter
						canForkToWorktree={canForkToWorktree}
						className="hover:opacity-100"
						item={row.item}
						onFork={onFork}
						text={displayText(snapshot, row.item.id)}
					/>
				);
		}
	})();
	const who = speaker ? speakers?.[speaker] : undefined;
	if (!who) return body;
	return (
		<>
			<SpeakerHeader
				at={speakerAt ?? null}
				newDay={speakerNewDay === true}
				speaker={who}
			/>
			{body}
		</>
	);
}
