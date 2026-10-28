import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { type SessionSnapshot, userMessageText } from "@superset/chat/core";
import type {
	ApprovalRequest,
	BackgroundTask,
	UserMessage,
} from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import {
	type FocusEvent,
	type KeyboardEvent,
	type Ref,
	type RefObject,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useNow } from "renderer/hooks/useNow";
import { CHAT_COLUMN_CLASSNAME, CHAT_GUTTER_CLASSNAME } from "../../constants";
import { parseAttachmentTags } from "../../utils/attachmentTags";
import { DrawerSection } from "./components/DrawerSection";
import { QueuedPromptRow } from "./components/QueuedPromptRow";
import { QueuePausedBar } from "./components/QueuePausedBar";
import { RunningRow } from "./components/RunningRow";
import { usePaneThird } from "./hooks/usePaneThird";
import { useQueueActions } from "./hooks/useQueueActions";
import type { DrawerExit, DrawerQueue, WorkDrawerHandle } from "./types";
import {
	type RunningRow as RunningEntry,
	runningRows,
} from "./utils/runningRows";

const MAX_HEIGHT = "13.5rem";
const STOP_SELECTOR = "[data-drawer-stop]";

type Section = "queued" | "running";

type Entry =
	| { kind: "queued"; prompt: UserMessage }
	| { kind: "running"; row: RunningEntry }
	| { kind: "header"; section: Section };

const hasAttachments = (prompt: UserMessage) =>
	prompt.content.some((content) => content.type === "attachment") ||
	parseAttachmentTags(userMessageText(prompt)).attachments.length > 0;

const stopsIn = (root: HTMLElement | null) => [
	...(root?.querySelectorAll<HTMLElement>(STOP_SELECTOR) ?? []),
];

function focusStop(stop: HTMLElement | undefined) {
	if (!stop) return false;
	stop.focus();
	stop.scrollIntoView?.({ block: "nearest" });
	return true;
}

export function WorkDrawer({
	ref,
	queue,
	tasks,
	snapshot,
	approvals = [],
	paneRef,
	now: readNow = Date.now,
	onAppendToComposer,
	onExit,
	onOpenSubagent,
	onStop,
	onMoveToBackground,
}: {
	ref?: Ref<WorkDrawerHandle>;
	queue?: DrawerQueue;
	tasks: readonly BackgroundTask[];
	snapshot: SessionSnapshot;
	approvals?: readonly ApprovalRequest[];
	paneRef?: RefObject<HTMLElement | null>;
	now?: () => number;
	onAppendToComposer: (text: string) => void;
	onExit: (exit: DrawerExit) => void;
	onOpenSubagent: (itemId: string) => void;
	onStop: (taskId: string) => void;
	onMoveToBackground: (taskId: string) => void;
}) {
	const { t } = useLingui();
	const rootRef = useRef<HTMLDivElement>(null);
	const [collapsed, setCollapsed] = useState({ queued: false, running: false });
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const lastFocusRef = useRef<string | null>(null);
	const previousKeysRef = useRef<string[]>([]);
	const queueActions = useQueueActions(queue, onAppendToComposer);
	const asking = useMemo(
		() => new Set(approvals.flatMap((approval) => approval.parentItemId ?? [])),
		[approvals],
	);
	const running = runningRows(
		tasks,
		snapshot,
		asking,
		t({ message: "Subagent" }),
		(count) =>
			plural(count, {
				one: "waiting on # subagent",
				other: "waiting on # subagents",
			}),
	);
	const prompts = queue?.prompts ?? [];
	const actionableQueue = queue?.actionable === true;
	const now = useNow(1000, running.length > 0, readNow).getTime();
	const paneThird = usePaneThird(paneRef);

	const showQueuedHeader = prompts.length > 1;
	if (!showQueuedHeader && collapsed.queued)
		setCollapsed((current) => ({ ...current, queued: false }));
	const entries = new Map<string, Entry>();
	if (prompts.length > 0) {
		if (showQueuedHeader)
			entries.set("header:queued", { kind: "header", section: "queued" });
		if (!showQueuedHeader || !collapsed.queued)
			for (const prompt of prompts)
				entries.set(`queued:${prompt.id}`, { kind: "queued", prompt });
	}
	if (running.length > 0) {
		entries.set("header:running", { kind: "header", section: "running" });
		if (!collapsed.running)
			for (const row of running)
				entries.set(`running:${row.task.id}`, { kind: "running", row });
	}
	const keys = [...entries.keys()];
	const lastKey =
		keys.filter((key) => !key.startsWith("header:")).at(-1) ?? keys.at(-1);
	const tabbableKey =
		activeKey !== null && entries.has(activeKey) ? activeKey : lastKey;
	const keySignature = keys.join("\n");
	const hasActionableEntry =
		(actionableQueue && prompts.length > 0) ||
		running.some((row) => row.kind === "subagent" || row.canStop);

	const exit = (mode: DrawerExit) => {
		lastFocusRef.current = null;
		onExit(mode);
	};

	useImperativeHandle(
		ref,
		() => ({
			focusLast: ({ actionableOnly = false } = {}) => {
				if (actionableOnly && !hasActionableEntry) return false;
				const stops = stopsIn(rootRef.current);
				const rows = stops.filter(
					(stop) => !stop.dataset.drawerStop?.startsWith("header:"),
				);
				return focusStop(rows.at(-1) ?? stops.at(-1));
			},
		}),
		[hasActionableEntry],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-check focus whenever the stops change
	useLayoutEffect(() => {
		const previousKeys = previousKeysRef.current;
		previousKeysRef.current = keys;
		const lost = lastFocusRef.current;
		if (!lost || entries.has(lost)) return;
		const active = document.activeElement;
		if (active && active !== document.body) return;
		const at = previousKeys.indexOf(lost);
		const sectionRow = lost.startsWith("header:")
			? keys.find((key) => key.startsWith(`${lost.slice("header:".length)}:`))
			: undefined;
		const neighbour =
			sectionRow ??
			[
				...previousKeys.slice(at + 1),
				...previousKeys.slice(0, at).reverse(),
			].find((key) => entries.has(key));
		const stop = stopsIn(rootRef.current).find(
			(candidate) => candidate.dataset.drawerStop === neighbour,
		);
		if (focusStop(stop)) return;
		exit("composer");
	}, [keySignature]);

	if (prompts.length === 0 && running.length === 0) return null;

	const toggle = (section: Section) => {
		const active = document.activeElement;
		const header = rootRef.current?.querySelector<HTMLElement>(
			`[data-drawer-stop="header:${section}"]`,
		);
		if (
			!collapsed[section] &&
			active instanceof HTMLElement &&
			active.dataset.drawerStop?.startsWith(`${section}:`)
		)
			header?.focus();
		setCollapsed((current) => ({ ...current, [section]: !current[section] }));
	};

	const primary = (entry: Entry) => {
		switch (entry.kind) {
			case "header":
				toggle(entry.section);
				return true;
			case "queued":
				if (!actionableQueue) return false;
				queueActions.onSteer(entry.prompt.id);
				exit("composer");
				return true;
			case "running":
				if (entry.row.kind !== "subagent") return false;
				onOpenSubagent(entry.row.task.id);
				exit("composer");
				return true;
		}
	};

	const remove = (entry: Entry) => {
		if (entry.kind === "header") return false;
		if (entry.kind === "queued") {
			if (!actionableQueue) return false;
			queueActions.onRemove(entry.prompt.id);
			return true;
		}
		if (!entry.row.canStop) return false;
		onStop(entry.row.task.id);
		return true;
	};

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target;
		if (!(target instanceof HTMLElement) || !rootRef.current?.contains(target))
			return;
		const stop = target.closest<HTMLElement>(STOP_SELECTOR);
		const stops = stopsIn(rootRef.current);
		const index = stop ? stops.indexOf(stop) : -1;
		const entry =
			stop && stop === target
				? entries.get(stop.dataset.drawerStop ?? "")
				: null;
		let handled = true;
		switch (event.key) {
			case "ArrowUp":
				if (index < 0) handled = false;
				else if (index === 0) exit("history");
				else focusStop(stops[index - 1]);
				break;
			case "ArrowDown":
				if (index < 0) handled = false;
				else if (!focusStop(stops[index + 1])) exit("composer");
				break;
			case "Escape":
				exit("composer");
				break;
			case "Enter":
				handled = entry ? primary(entry) : false;
				break;
			case " ":
				handled = entry?.kind === "header" && primary(entry);
				break;
			case "Backspace":
			case "Delete":
				handled = entry ? remove(entry) : false;
				break;
			case "e":
				handled =
					entry?.kind === "queued" &&
					actionableQueue &&
					!hasAttachments(entry.prompt);
				if (handled && entry?.kind === "queued")
					queueActions.onEdit(entry.prompt);
				break;
			default:
				handled = false;
		}
		if (!handled) return;
		event.preventDefault();
		event.stopPropagation();
	};

	const onFocus = (event: FocusEvent<HTMLDivElement>) => {
		const key =
			event.target instanceof HTMLElement
				? event.target.dataset.drawerStop
				: undefined;
		if (!key) return;
		setActiveKey(key);
		lastFocusRef.current = key;
	};

	const onBlur = (event: FocusEvent<HTMLDivElement>) => {
		const next = event.relatedTarget;
		if (next instanceof Node && event.currentTarget.contains(next)) return;
		if (event.target.isConnected) lastFocusRef.current = null;
	};

	const queuedCount = prompts.length;
	const runningCount = running.length;
	const subagentCount = running.filter((row) => row.kind === "subagent").length;
	const shellCount = runningCount - subagentCount;
	const approvalCount = running.filter((row) => row.needsApproval).length;
	const runningSummary = (
		<>
			<span className="truncate">
				{[
					subagentCount > 0 &&
						plural(subagentCount, {
							one: "# subagent",
							other: "# subagents",
						}),
					shellCount > 0 &&
						plural(shellCount, { one: "# shell", other: "# shells" }),
				]
					.filter(Boolean)
					.join(" · ")}
			</span>
			{approvalCount > 0 && (
				<span className="shrink-0 text-warning">
					{plural(approvalCount, {
						one: "# needs approval",
						other: "# need approval",
					})}
				</span>
			)}
		</>
	);

	return (
		<div className={cn(CHAT_GUTTER_CLASSNAME, "-mb-1")}>
			<div className={CHAT_COLUMN_CLASSNAME}>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: one key handler serves both listboxes inside */}
				<div
					className="mx-4 flex flex-col overflow-hidden rounded-t-2xl border border-border/60 border-b-0 bg-muted/40"
					data-work-drawer
					onBlur={onBlur}
					onFocus={onFocus}
					onKeyDown={onKeyDown}
					ref={rootRef}
				>
					<div
						className="overflow-y-auto p-1"
						data-work-drawer-scroller
						style={{
							maxHeight: paneThird
								? `min(${MAX_HEIGHT}, ${paneThird}px)`
								: MAX_HEIGHT,
						}}
					>
						{prompts.length > 0 && (
							<DrawerSection
								stopKey="header:queued"
								tabbable={tabbableKey === "header:queued"}
								banner={
									queue?.paused && (
										<QueuePausedBar
											actionable={queue.actionable}
											onClear={queueActions.onClear}
											onResume={queueActions.onResume}
										/>
									)
								}
								expanded={!collapsed.queued}
								showHeader={showQueuedHeader}
								onToggle={() => toggle("queued")}
								count={queuedCount}
								title={t({ message: "Queued" })}
							>
								{prompts.map((prompt) => (
									<QueuedPromptRow
										actionable={actionableQueue}
										key={prompt.id}
										onEdit={queueActions.onEdit}
										onRemove={queueActions.onRemove}
										onSteer={queueActions.onSteer}
										prompt={prompt}
										rowKey={`queued:${prompt.id}`}
										tabbable={tabbableKey === `queued:${prompt.id}`}
									/>
								))}
							</DrawerSection>
						)}
						{prompts.length > 0 && running.length > 0 && (
							<div className="mx-2 my-1 border-border/60 border-t" />
						)}
						{running.length > 0 && (
							<DrawerSection
								stopKey="header:running"
								tabbable={tabbableKey === "header:running"}
								expanded={!collapsed.running}
								onToggle={() => toggle("running")}
								count={runningCount}
								summary={runningSummary}
								title={t({ message: "Running" })}
							>
								{running.map((row) => (
									<RunningRow
										key={row.task.id}
										kind={row.kind}
										name={row.name}
										needsApproval={row.needsApproval}
										now={now}
										onMoveToBackground={
											row.canBackground
												? () => onMoveToBackground(row.task.id)
												: undefined
										}
										onOpen={
											row.kind === "subagent"
												? () => onOpenSubagent(row.task.id)
												: undefined
										}
										onStop={row.canStop ? () => onStop(row.task.id) : undefined}
										rowKey={`running:${row.task.id}`}
										runningSubagents={row.runningSubagents}
										startedAtMs={row.task.startedAtMs}
										step={row.step}
										tabbable={tabbableKey === `running:${row.task.id}`}
									/>
								))}
							</DrawerSection>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
