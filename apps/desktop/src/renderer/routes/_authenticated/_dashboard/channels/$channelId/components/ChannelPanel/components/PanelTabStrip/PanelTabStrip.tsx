import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	AnimatePresence,
	MotionConfig,
	motion,
	type Transition,
} from "framer-motion";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { LuPlus } from "react-icons/lu";
import { useElementWidth } from "../../../../hooks/useElementWidth";
import { PanelTab } from "./components/PanelTab";
import { TabPreviewCard } from "./components/TabPreviewCard";
import { useCloseFreeze } from "./hooks/useCloseFreeze";
import { useTabPreviewHover } from "./hooks/useTabPreviewHover";
import { tabStripLayout } from "./utils/tabStripLayout";

// Codex's tab strip timing: tabs grow and reflow in 200ms, close in 100ms.
const TAB_TRANSITION: Transition = {
	duration: 0.2,
	ease: [1 / 3, 2 / 3, 2 / 3, 1],
};
const TAB_EXIT: Transition = { ...TAB_TRANSITION, duration: 0.1 };
const INSTANT: Transition = { duration: 0 };
// The new-tab button, the gap before it, and a little window-drag space.
const RESERVED_WIDTH = 28 + 4 + 16;

export interface PanelTabEntry {
	key: string;
	label: string;
	icon: ReactNode;
	menuItems?: ReactNode;
}

interface PanelTabStripProps {
	tabs: PanelTabEntry[];
	activeKey: string | null;
	onActivate: (key: string) => void;
	onClose: (key: string) => void;
	onCloseOthers: (key: string) => void;
	onCloseToRight: (key: string) => void;
	onNewTab: () => void;
	renderPreview: (key: string) => ReactNode;
	leading?: ReactNode;
	trailing?: ReactNode;
}

export function PanelTabStrip({
	tabs,
	activeKey,
	onActivate,
	onClose,
	onCloseOthers,
	onCloseToRight,
	onNewTab,
	renderPreview,
	leading,
	trailing,
}: PanelTabStripProps) {
	const { t } = useLingui();
	const listRef = useRef<HTMLDivElement>(null);
	const [area, setArea] = useState<HTMLDivElement | null>(null);
	const areaWidth = useElementWidth(area);
	const available = areaWidth === null ? null : areaWidth - RESERVED_WIDTH;
	const layout = tabStripLayout(available, tabs.length);
	const closing = useCloseFreeze();
	const tabWidth = closing.frozen ?? layout.tabWidth;

	// Width changes animate when tabs open or close, never while resizing.
	const [motionState, setMotionState] = useState({
		available,
		count: tabs.length,
		animate: false,
	});
	if (
		motionState.available !== available ||
		motionState.count !== tabs.length
	) {
		setMotionState({
			available,
			count: tabs.length,
			animate: motionState.available === available,
		});
	}
	const transition = motionState.animate ? TAB_TRANSITION : INSTANT;

	const preview = useTabPreviewHover();
	const previewKey =
		preview.shown && preview.shown.key !== activeKey ? preview.shown.key : null;

	const revealActive = useCallback(() => {
		if (!activeKey) return;
		listRef.current
			?.querySelector(`[data-tab-key="${CSS.escape(activeKey)}"]`)
			?.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
				inline: "nearest",
			});
	}, [activeKey]);
	useEffect(revealActive, [revealActive]);

	const moveFocus = (offset: number | "first" | "last") => {
		if (tabs.length === 0) return;
		const index = tabs.findIndex((tab) => tab.key === activeKey);
		const next =
			offset === "first"
				? 0
				: offset === "last"
					? tabs.length - 1
					: (index + offset + tabs.length) % tabs.length;
		const tab = tabs[next];
		if (!tab) return;
		onActivate(tab.key);
		requestAnimationFrame(() =>
			listRef.current
				?.querySelector<HTMLElement>(
					`[data-tab-key="${CSS.escape(tab.key)}"] [role=tab]`,
				)
				?.focus(),
		);
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: leaving the strip ends the close-width freeze
		<div
			className="flex h-12 shrink-0 items-stretch bg-muted/45 shadow-[inset_0_-1px_0_var(--border)] dark:bg-muted/35"
			onMouseLeave={() => closing.release()}
		>
			{leading}
			<div
				ref={setArea}
				className="flex h-full min-w-0 flex-1 items-center gap-1 ps-1.5"
			>
				<div
					ref={listRef}
					role="tablist"
					aria-orientation="horizontal"
					className={cn(
						"hide-scrollbar flex h-full min-w-0 flex-initial scroll-px-1 items-center",
						layout.scrolls || closing.frozen !== null
							? "overflow-x-auto overflow-y-hidden"
							: "overflow-clip",
					)}
					onKeyDown={(event) => {
						const move =
							event.key === "ArrowRight"
								? 1
								: event.key === "ArrowLeft"
									? -1
									: event.key === "Home"
										? "first"
										: event.key === "End"
											? "last"
											: null;
						if (move === null) return;
						event.preventDefault();
						moveFocus(move);
					}}
				>
					<div className="flex h-full w-max shrink-0 items-center">
						<MotionConfig reducedMotion="user">
							<AnimatePresence initial={false}>
								{tabs.map((tab, index) => {
									const next = tabs[index + 1];
									const showDivider =
										next !== undefined &&
										tab.key !== activeKey &&
										next.key !== activeKey;
									return (
										<motion.div
											key={tab.key}
											data-tab-key={tab.key}
											className="relative flex h-full shrink-0 items-center overflow-hidden px-0.5 py-2"
											initial={{ width: 0 }}
											animate={{ width: tabWidth }}
											exit={{ width: 0, transition: TAB_EXIT }}
											transition={transition}
											onAnimationComplete={
												tab.key === activeKey ? revealActive : undefined
											}
										>
											<PanelTab
												id={`channel-panel-tab-${tab.key}`}
												label={tab.label}
												icon={tab.icon}
												isActive={tab.key === activeKey}
												canCloseOthers={tabs.length > 1}
												canCloseToRight={next !== undefined}
												menuItems={tab.menuItems}
												onSelect={() => onActivate(tab.key)}
												onClose={() => {
													closing.freeze(tabWidth);
													preview.leave();
													onClose(tab.key);
												}}
												onCloseOthers={() => onCloseOthers(tab.key)}
												onCloseToRight={() => onCloseToRight(tab.key)}
												onHover={(element) => preview.enter(tab.key, element)}
												onUnhover={preview.leave}
											/>
											<span
												aria-hidden
												className={cn(
													"absolute end-0 h-3 w-px bg-border",
													showDivider ? "opacity-100" : "opacity-0",
												)}
											/>
										</motion.div>
									);
								})}
							</AnimatePresence>
						</MotionConfig>
					</div>
				</div>
				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "New tab" })}
							onClick={onNewTab}
							className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-fill-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
						>
							<LuPlus className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t({ message: "New tab" })}
					</TooltipContent>
				</Tooltip>
				<div className="drag h-full min-w-4 flex-1" />
			</div>
			{trailing}
			{previewKey && preview.shown && (
				<TabPreviewCard cardKey={previewKey} anchor={preview.shown.anchor}>
					{renderPreview(previewKey)}
				</TabPreviewCard>
			)}
		</div>
	);
}
