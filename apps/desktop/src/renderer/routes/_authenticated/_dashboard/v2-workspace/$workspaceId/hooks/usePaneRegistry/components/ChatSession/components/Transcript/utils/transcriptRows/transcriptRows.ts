import {
	isPendingApproval,
	type OutboxEntry,
	type TurnGroup,
	toolRunKey,
	transcriptItemKey,
} from "@superset/chat/core";
import type {
	AgentMessage,
	ApprovalRequest,
	Item,
	Notice,
	ToolCall,
	Turn,
	TurnError,
	UserMessage,
} from "@superset/chat/protocol";
import type { TranscriptCardRef } from "../../../../providers/TranscriptCardsProvider";
import type { PageLink, PageLinkFinder } from "../../../../utils/pageLinks";
import {
	type CardFinder,
	type MessageCardFinder,
	turnCards,
} from "../turnCards";
import {
	changesFiles,
	type TurnFileChange,
	turnChangedFiles,
} from "../turnChangedFiles";
import { turnPageLinks } from "../turnPageLinks";

export type TranscriptRow =
	| {
			kind: "working";
			key: string;
			groupStart: boolean;
			startedAtMs: number;
			completedAtMs: number | undefined;
			running: boolean;
			/** The turn is held on a question or approval only the user can answer. */
			waiting: boolean;
			/** The turn's work is folded under this row until it is opened. */
			foldable?: boolean;
			/** This turn only continued the one before (the harness woke it), so its clock folds with that turn's work. */
			folded?: boolean;
			foldKey?: string;
	  }
	| {
			kind: "item";
			key: string;
			groupStart: boolean;
			item: Item;
			/** Pages to show as cards under a tool call. */
			pages?: readonly PageLink[];
			/** Things the tool call made, shown as cards under it. */
			cards?: readonly TranscriptCardRef[];
			/** Slugs an agent message leaves to the earlier message that shows them. */
			pagesShownEarlier?: string;
			/** An approval whose target tool call is the row right above it. */
			afterTarget?: boolean;
			/** Part of a settled turn's work; shown only when the turn is opened. */
			folded?: boolean;
			/** The clock row this row folds under. */
			foldKey?: string;
	  }
	| { kind: "outbox"; key: string; groupStart: boolean; entry: OutboxEntry }
	| {
			kind: "tool_run";
			key: string;
			groupStart: boolean;
			items: ToolCall[];
			/** The run's tool calls with the agent's thinking between them, in order. */
			steps: Item[];
			defaultCollapsed: boolean;
			active?: boolean;
			/** Pages to show as cards under the run, so a collapsed run still shows them. */
			pages?: readonly PageLink[];
			/** Things the run made, shown as cards under it. */
			cards?: readonly TranscriptCardRef[];
			/** How many of the run's calls earned a card; all of them means the run can hide behind its cards. */
			cardToolCount?: number;
			/** Part of a settled turn's work; shown only when the turn is opened. */
			folded?: boolean;
			/** The clock row this row folds under. */
			foldKey?: string;
	  }
	| {
			kind: "turn_status";
			key: string;
			groupStart: boolean;
			turnId: string;
			status: "failed" | "interrupted";
			error: TurnError | undefined;
			/** No turn came after it, so its failure can still be acted on. */
			latest: boolean;
	  }
	| {
			kind: "reply_footer";
			key: string;
			groupStart: false;
			item: AgentMessage;
	  }
	| {
			kind: "changed_files";
			key: string;
			groupStart: false;
			turnId: string;
			files: TurnFileChange[];
			/** The calls behind the files, so a reopened chat can load their bodies. */
			calls: ToolCall[];
			/** Every tool call of the turn; their ids find its snapshots after a resume. */
			toolCallIds: string[];
			/** The chat's latest card while no turn runs: the only one that offers Undo. */
			newest?: boolean;
	  };

/**
 * The agent reports a failure both as an error notice and on the turn; the
 * turn's row says it once. What the notice adds past the turn's message is the
 * stderr an older host kept only there, so the row keeps it.
 */
function repeatedTurnFailure(
	item: Item,
	turn: Turn | null,
): { extra: string } | null {
	if (turn?.status !== "failed" || item.kind !== "notice") return null;
	const notice = item as Notice;
	if (notice.noticeKind !== "error") return null;
	const text = notice.text ?? "";
	const message = turn.error?.message ?? "";
	if (text === message) return { extra: "" };
	if (message === "" || !text.startsWith(`${message}\n`)) return null;
	return { extra: text.slice(message.length).trim() };
}

function asksTheUser(entry: TurnGroup["entries"][number]): boolean {
	return entry.kind === "item" && isPendingApproval(entry.item);
}

function withNoticeDetail(
	error: TurnError | undefined,
	noticeDetail: string,
): TurnError | undefined {
	if (!error || error.kind || error.detail || !noticeDetail) return error;
	return { ...error, detail: noticeDetail };
}

const MAX_ANCHOR_IDS = 100;

/**
 * A replayed turn can carry no span of its own; its items still say when
 * the work started and ended.
 */
function turnSpan(
	turn: Turn,
	entries: TurnGroup["entries"],
): { startedAtMs: number; completedAtMs: number | undefined } {
	if (
		turn.completedAtMs === undefined ||
		turn.completedAtMs > turn.startedAtMs
	) {
		return { startedAtMs: turn.startedAtMs, completedAtMs: turn.completedAtMs };
	}
	let first = Number.POSITIVE_INFINITY;
	let last = 0;
	for (const entry of entries) {
		const items = entry.kind === "tool_run" ? entry.items : [entry.item];
		for (const item of items) {
			if (item.kind === "user_message") continue;
			first = Math.min(first, item.startedAtMs);
			last = Math.max(last, item.completedAtMs ?? item.startedAtMs);
		}
	}
	if (!Number.isFinite(first) || last <= first) {
		return { startedAtMs: turn.startedAtMs, completedAtMs: turn.completedAtMs };
	}
	return { startedAtMs: first, completedAtMs: last };
}

/** A shell command or a subagent can change files no diff shows; only a snapshot sees them. */
function editsUnseen(call: ToolCall): boolean {
	if (call.status === "running" || call.status === "declined") return false;
	return call.toolKind === "execute" || call.subagent === true;
}

export function transcriptRows(
	groups: readonly TurnGroup[],
	outbox: readonly OutboxEntry[],
	pendingApprovalTargets: ReadonlySet<string>,
	findPageLinks: PageLinkFinder,
	hiddenToolIds: ReadonlySet<string> = new Set(),
	standaloneTool: (tool: ToolCall) => boolean = () => false,
	findCards: CardFinder = () => [],
	findMessageCards: MessageCardFinder = () => [],
	collapseLoneTools = false,
	isHarnessNote: HarnessNoteTest = () => false,
): TranscriptRow[] {
	const rows: TranscriptRow[] = [];
	const echoedClientIds = new Set<string>();

	for (const group of groups) {
		let groupStart = true;
		const push = (row: TranscriptRow) => {
			rows.push(row);
			groupStart = false;
		};
		const turn = group.turn;
		let clockPlaced = turn === null;
		const placeClock = () => {
			if (clockPlaced || !turn) return;
			clockPlaced = true;
			const span = turnSpan(turn, group.entries);
			push({
				kind: "working",
				key: `working:${group.turnId}`,
				groupStart,
				startedAtMs: span.startedAtMs,
				completedAtMs: span.completedAtMs,
				running: turn.status === "running",
				waiting: turn.status === "running" && group.entries.some(asksTheUser),
			});
		};
		const turnSettled = turn !== null && turn.status !== "running";
		const links = turnPageLinks(group.entries, turnSettled, findPageLinks);
		const cards = turnCards(group.entries, findCards);
		const lastPrompt = group.entries.findLastIndex(
			(entry) => entry.kind === "item" && entry.item.kind === "user_message",
		);
		let noticeDetail = "";
		let run = null as Extract<TranscriptRow, { kind: "tool_run" }> | null;
		let runAt = -1;
		let lastReplyAt = -1;
		const calls: ToolCall[] = [];
		const unwrapLoneCall = () => {
			if (collapseLoneTools) return;
			const only = run?.steps.length === 1 ? run.items[0] : undefined;
			if (!run || !only) return;
			rows[runAt] = {
				kind: "item",
				key: transcriptItemKey(only),
				groupStart: run.groupStart,
				item: only,
				...(run.pages ? { pages: run.pages } : {}),
				...(run.cards ? { cards: run.cards } : {}),
			};
		};
		const pushItem = (item: Item) => {
			unwrapLoneCall();
			run = null;
			const clientId =
				item.kind === "user_message"
					? (item as UserMessage).clientId
					: undefined;
			if (clientId) echoedClientIds.add(clientId);
			const pages = links.fromTools.get(item.id);
			const itemCards = cards.get(item.id);
			const pagesShownEarlier = links.shownEarlier.get(item.id);
			const targetId =
				item.kind === "approval_request"
					? (item as ApprovalRequest).targetItemId
					: null;
			const above = groupStart ? undefined : rows.at(-1);
			const afterTarget =
				targetId !== null &&
				((above?.kind === "item" && above.item.id === targetId) ||
					(above?.kind === "tool_run" && above.items.at(-1)?.id === targetId));
			push({
				kind: "item",
				key: transcriptItemKey(item),
				groupStart,
				item,
				...(pages ? { pages } : {}),
				...(itemCards ? { cards: itemCards } : {}),
				...(pagesShownEarlier ? { pagesShownEarlier } : {}),
				...(afterTarget ? { afterTarget } : {}),
			});
			if (item.kind === "agent_message") lastReplyAt = rows.length - 1;
		};
		const addTools = (
			items: ToolCall[],
			keyTools: readonly ToolCall[],
			index: number,
		) => {
			if (items.length === 0) return;
			const pages = items.flatMap((tool) => links.fromTools.get(tool.id) ?? []);
			const toolCards = items.flatMap((tool) => cards.get(tool.id) ?? []);
			const cardTools = items.filter((tool) => cards.has(tool.id)).length;
			const waiting = items.some((tool) => pendingApprovalTargets.has(tool.id));
			if (run) {
				run.items.push(...items);
				run.steps.push(...items);
				if (waiting) run.defaultCollapsed = false;
				if (pages.length > 0) run.pages = [...(run.pages ?? []), ...pages];
				if (toolCards.length > 0)
					run.cards = [...(run.cards ?? []), ...toolCards];
				if (cardTools > 0)
					run.cardToolCount = (run.cardToolCount ?? 0) + cardTools;
				return;
			}
			run = {
				kind: "tool_run",
				key: toolRunKey(group.turnId, keyTools, index),
				groupStart,
				items: [...items],
				steps: [...items],
				defaultCollapsed: !waiting,
				...(pages.length > 0 ? { pages } : {}),
				...(toolCards.length > 0 ? { cards: toolCards } : {}),
				...(cardTools > 0 ? { cardToolCount: cardTools } : {}),
			};
			runAt = rows.length;
			push(run);
		};
		for (const [index, entry] of group.entries.entries()) {
			if (index > lastPrompt) placeClock();
			const tools =
				entry.kind === "tool_run"
					? entry.items
					: entry.item.kind === "tool_call"
						? [entry.item as ToolCall]
						: null;
			if (tools) calls.push(...tools);
			if (entry.kind === "item" && !tools) {
				if (hiddenToolIds.has(entry.item.id)) continue;
				const repeated = repeatedTurnFailure(entry.item, turn);
				if (repeated) {
					noticeDetail ||= repeated.extra;
					continue;
				}
				if (run && entry.item.kind === "reasoning") {
					run.steps.push(entry.item);
					continue;
				}
				pushItem(entry.item);
				continue;
			}
			if (!tools) continue;
			const visible = tools.filter((tool) => !hiddenToolIds.has(tool.id));
			if (visible.length === 0) continue;
			if (!visible.some(standaloneTool)) {
				addTools(visible, tools, index);
				continue;
			}
			let chunk: ToolCall[] = [];
			for (const tool of visible) {
				if (!standaloneTool(tool)) {
					chunk.push(tool);
					continue;
				}
				addTools(chunk, chunk, index);
				chunk = [];
				pushItem(tool);
			}
			addTools(chunk, chunk, index);
		}
		unwrapLoneCall();
		placeClock();
		if (turn?.status === "running" && run && rows.at(-1) === run)
			run.active = true;
		const files = turnSettled ? turnChangedFiles(calls) : [];
		if (files.length > 0 || (turnSettled && calls.some(editsUnseen))) {
			const card: TranscriptRow = {
				kind: "changed_files",
				key: `changed_files:${group.turnId}`,
				groupStart: false,
				turnId: group.turnId,
				files,
				calls: calls.filter(changesFiles),
				toolCallIds: calls.slice(0, MAX_ANCHOR_IDS).map((call) => call.id),
			};
			if (lastReplyAt === -1) push(card);
			else rows.splice(lastReplyAt + 1, 0, card);
		}
		if (turn?.status === "failed" || turn?.status === "interrupted") {
			push({
				kind: "turn_status",
				key: `status:${group.turnId}`,
				groupStart,
				turnId: group.turnId,
				status: turn.status,
				error: withNoticeDetail(turn.error, noticeDetail),
				latest: group === groups.at(-1),
			});
		}
	}

	attachAsked(rows, groups, outbox, findMessageCards);
	if (collapseLoneTools) foldWork(rows, isHarnessNote);

	const newestCard = rows.findLast((row) => row.kind === "changed_files");
	if (
		newestCard?.kind === "changed_files" &&
		groups.at(-1)?.turn?.status !== "running"
	) {
		newestCard.newest = true;
	}

	for (const entry of outbox) {
		if (echoedClientIds.has(entry.clientId)) continue;
		rows.push({ kind: "outbox", key: entry.clientId, groupStart: true, entry });
	}
	return rows;
}

/**
 * In a quiet transcript a settled turn shows its clock and its last reply;
 * the work between them (narration, folded tool runs, notices) waits
 * behind the clock. A running turn stays open so progress shows.
 */
/**
 * Everything between a settled turn's clock and its last reply folds behind
 * the clock, as does what trails the reply before the next turn: a notice or
 * a background result is work, not an answer.
 */
/** A user message the harness wrote to itself, such as a background result, rather than the person. */
export type HarnessNoteTest = (item: UserMessage) => boolean;

function foldWork(rows: TranscriptRow[], isHarnessNote: HarnessNoteTest): void {
	let clockAt = -1;
	let replyAt = -1;
	// A harness note (a background result) wakes the agent for another turn
	// that is the same piece of work to the person: it folds under one clock.
	let continued = false;
	const close = (endAt: number) => {
		if (clockAt === -1 || replyAt === -1) return;
		const clock = rows[clockAt];
		if (clock?.kind !== "working") return;
		let folded = false;
		for (let index = clockAt + 1; index < endAt; index += 1) {
			const row = rows[index];
			if (
				row?.kind !== "item" &&
				row?.kind !== "tool_run" &&
				row?.kind !== "working"
			)
				continue;
			if (
				index > replyAt &&
				row.kind === "item" &&
				row.item.kind === "agent_message"
			)
				continue;
			if (index === replyAt) continue;
			row.folded = true;
			row.foldKey = clock.key;
			folded = true;
		}
		if (folded) clock.foldable = true;
	};
	for (const [index, row] of rows.entries()) {
		if (row.kind === "working") {
			if (continued && clockAt !== -1 && !row.running) {
				continued = false;
				continue;
			}
			close(index);
			clockAt = row.running ? -1 : index;
			replyAt = -1;
			continued = false;
			continue;
		}
		if (row.kind === "item" && row.item.kind === "user_message") {
			if (isHarnessNote(row.item as UserMessage)) {
				continued = clockAt !== -1;
				continue;
			}
			close(index);
			clockAt = -1;
			replyAt = -1;
			continued = false;
			continue;
		}
		if (row.kind === "item" && row.item.kind === "agent_message") {
			replyAt = index;
		}
	}
	close(rows.length);
}

/**
 * What the newest reply asks goes under it as cards, but only while the
 * question is open: no turn running, nothing being sent, and no prompt after
 * the reply.
 */
function attachAsked(
	rows: TranscriptRow[],
	groups: readonly TurnGroup[],
	outbox: readonly OutboxEntry[],
	findMessageCards: MessageCardFinder,
): void {
	if (outbox.length > 0 || groups.at(-1)?.turn?.status === "running") return;
	const replyAt = rows.findLastIndex(
		(row) => row.kind === "item" && row.item.kind === "agent_message",
	);
	const promptAt = rows.findLastIndex(
		(row) => row.kind === "item" && row.item.kind === "user_message",
	);
	const reply = rows[replyAt];
	if (replyAt < promptAt || reply?.kind !== "item") return;
	const asked = findMessageCards(reply.item as AgentMessage);
	if (asked.length > 0) reply.cards = [...(reply.cards ?? []), ...asked];
}

/** The id a row registers with the scroller, so a jump can land on it. */
export function rowMessageId(row: TranscriptRow): string {
	if (row.kind === "item") return row.item.id;
	if (row.kind === "tool_run") return row.items[0]?.id ?? row.key;
	return row.key;
}
