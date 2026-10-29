import {
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
import type { PageLink, PageLinkFinder } from "../../../../utils/pageLinks";
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
	  }
	| {
			kind: "item";
			key: string;
			groupStart: boolean;
			item: Item;
			/** Pages to show as cards under a tool call. */
			pages?: readonly PageLink[];
			/** Slugs an agent message leaves to the earlier message that shows them. */
			pagesShownEarlier?: string;
			/** An approval whose target tool call is the row right above it. */
			afterTarget?: boolean;
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

function withNoticeDetail(
	error: TurnError | undefined,
	noticeDetail: string,
): TurnError | undefined {
	if (!error || error.kind || error.detail || !noticeDetail) return error;
	return { ...error, detail: noticeDetail };
}

const MAX_ANCHOR_IDS = 100;

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
			push({
				kind: "working",
				key: `working:${group.turnId}`,
				groupStart,
				startedAtMs: turn.startedAtMs,
				completedAtMs: turn.completedAtMs,
				running: turn.status === "running",
			});
		};
		const turnSettled = turn !== null && turn.status !== "running";
		const links = turnPageLinks(group.entries, turnSettled, findPageLinks);
		const lastPrompt = group.entries.findLastIndex(
			(entry) => entry.kind === "item" && entry.item.kind === "user_message",
		);
		let noticeDetail = "";
		let run = null as Extract<TranscriptRow, { kind: "tool_run" }> | null;
		let runAt = -1;
		let lastReplyAt = -1;
		const calls: ToolCall[] = [];
		const unwrapLoneCall = () => {
			const only = run?.steps.length === 1 ? run.items[0] : undefined;
			if (!run || !only) return;
			rows[runAt] = {
				kind: "item",
				key: transcriptItemKey(only),
				groupStart: run.groupStart,
				item: only,
				...(run.pages ? { pages: run.pages } : {}),
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
			const waiting = items.some((tool) => pendingApprovalTargets.has(tool.id));
			if (run) {
				run.items.push(...items);
				run.steps.push(...items);
				if (waiting) run.defaultCollapsed = false;
				if (pages.length > 0) run.pages = [...(run.pages ?? []), ...pages];
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

/** The id a row registers with the scroller, so a jump can land on it. */
export function rowMessageId(row: TranscriptRow): string {
	if (row.kind === "item") return row.item.id;
	if (row.kind === "tool_run") return row.items[0]?.id ?? row.key;
	return row.key;
}
