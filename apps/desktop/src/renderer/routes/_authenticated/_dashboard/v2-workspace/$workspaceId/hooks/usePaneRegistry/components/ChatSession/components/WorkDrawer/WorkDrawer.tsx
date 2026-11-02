import { useLingui } from "@lingui/react/macro";
import type { UserMessage } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import {
	type FocusEvent,
	type KeyboardEvent,
	type ReactNode,
	type Ref,
	type RefObject,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { CHAT_COLUMN_CLASSNAME, CHAT_GUTTER_CLASSNAME } from "../../constants";
import { DrawerSection } from "./components/DrawerSection";
import { QueuedPromptRow } from "./components/QueuedPromptRow";
import { QueuePausedBar } from "./components/QueuePausedBar";
import { usePaneThird } from "./hooks/usePaneThird";
import { useQueueActions } from "./hooks/useQueueActions";
import type { DrawerExit, DrawerQueue, WorkDrawerHandle } from "./types";

const MAX_HEIGHT = "13.5rem";
const STOP_SELECTOR = "[data-drawer-stop]";

type Entry = { kind: "queued"; prompt: UserMessage } | { kind: "header" };

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
	notice,
	paneRef,
	onExit,
}: {
	ref?: Ref<WorkDrawerHandle>;
	queue?: DrawerQueue;
	/** A row above the queue that speaks for it, e.g. the usage limit. */
	notice?: ReactNode;
	paneRef?: RefObject<HTMLElement | null>;
	onExit: (exit: DrawerExit) => void;
}) {
	const { t } = useLingui();
	const rootRef = useRef<HTMLDivElement>(null);
	const [collapsed, setCollapsed] = useState(false);
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const lastFocusRef = useRef<string | null>(null);
	const previousKeysRef = useRef<string[]>([]);
	const queueActions = useQueueActions(queue);
	const [editingId, setEditingId] = useState<string | null>(null);
	const prompts = queue?.prompts ?? [];
	const actionableQueue = queue?.actionable === true;
	const paneThird = usePaneThird(paneRef);

	const showQueuedHeader = prompts.length > 1;
	if (!showQueuedHeader && collapsed) setCollapsed(false);
	const entries = new Map<string, Entry>();
	if (prompts.length > 0) {
		if (showQueuedHeader) entries.set("header:queued", { kind: "header" });
		if (!showQueuedHeader || !collapsed)
			for (const prompt of prompts)
				entries.set(`queued:${prompt.id}`, { kind: "queued", prompt });
	}
	const keys = [...entries.keys()];
	const lastKey =
		keys.filter((key) => !key.startsWith("header:")).at(-1) ?? keys.at(-1);
	const tabbableKey =
		activeKey !== null && entries.has(activeKey) ? activeKey : lastKey;
	const keySignature = keys.join("\n");
	const hasActionableEntry = actionableQueue && prompts.length > 0;

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

	if (prompts.length === 0 && !notice) return null;

	const toggle = () => {
		const active = document.activeElement;
		const header = rootRef.current?.querySelector<HTMLElement>(
			'[data-drawer-stop="header:queued"]',
		);
		if (
			!collapsed &&
			active instanceof HTMLElement &&
			active.dataset.drawerStop?.startsWith("queued:")
		)
			header?.focus();
		setCollapsed((current) => !current);
	};

	const primary = (entry: Entry) => {
		switch (entry.kind) {
			case "header":
				toggle();
				return true;
			case "queued":
				if (!actionableQueue) return false;
				queueActions.onSteer(entry.prompt.id);
				exit("composer");
				return true;
		}
	};

	const remove = (entry: Entry) => {
		if (entry.kind === "header" || !actionableQueue) return false;
		queueActions.onRemove(entry.prompt.id);
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
				handled = entry?.kind === "queued" && actionableQueue;
				if (handled && entry?.kind === "queued") setEditingId(entry.prompt.id);
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
					{notice}
					<div
						className={cn(
							"overflow-y-auto p-1",
							notice && "border-border/60 border-t",
							prompts.length === 0 && "hidden",
						)}
						data-work-drawer-scroller
						style={{
							maxHeight: paneThird
								? `min(${MAX_HEIGHT}, ${paneThird}px)`
								: MAX_HEIGHT,
						}}
					>
						<DrawerSection
							stopKey="header:queued"
							tabbable={tabbableKey === "header:queued"}
							banner={
								queue?.paused &&
								!(queue.pausedByLimit && notice) && (
									<QueuePausedBar
										actionable={queue.actionable}
										byLimit={queue.pausedByLimit === true}
										onClear={queueActions.onClear}
										onResume={queueActions.onResume}
									/>
								)
							}
							expanded={!collapsed}
							showHeader={showQueuedHeader}
							onToggle={toggle}
							count={prompts.length}
							title={t({ message: "Queued" })}
						>
							{prompts.map((prompt) => (
								<QueuedPromptRow
									actionable={actionableQueue}
									key={prompt.id}
									editing={editingId === prompt.id}
									onEdit={() => setEditingId(prompt.id)}
									onEditEnd={(text) => {
										setEditingId(null);
										if (text !== null) queueActions.onUpdate(prompt, text);
									}}
									onRemove={queueActions.onRemove}
									onSteer={queueActions.onSteer}
									prompt={prompt}
									rowKey={`queued:${prompt.id}`}
									tabbable={tabbableKey === `queued:${prompt.id}`}
								/>
							))}
						</DrawerSection>
					</div>
				</div>
			</div>
		</div>
	);
}
