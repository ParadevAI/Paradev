import { Trans, useLingui } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { OverflowFadeText } from "@superset/ui/overflow-fade-text";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";

interface PanelTabProps {
	id: string;
	label: string;
	icon: ReactNode;
	isActive: boolean;
	canCloseOthers: boolean;
	canCloseToRight: boolean;
	menuItems?: ReactNode;
	onSelect: () => void;
	onClose: () => void;
	onCloseOthers: () => void;
	onCloseToRight: () => void;
	onHover: (element: HTMLElement) => void;
	onUnhover: () => void;
}

export function PanelTab({
	id,
	label,
	icon,
	isActive,
	canCloseOthers,
	canCloseToRight,
	menuItems,
	onSelect,
	onClose,
	onCloseOthers,
	onCloseToRight,
	onHover,
	onUnhover,
}: PanelTabProps) {
	const { t } = useLingui();
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: hover only shows the preview card */}
				<div
					className={cn(
						"group/tab relative flex h-full w-full min-w-0 items-center rounded-lg text-xs transition-colors",
						isActive
							? "bg-background text-foreground shadow-xs ring-1 ring-border/60 dark:bg-muted"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
					)}
					onMouseEnter={(event) => {
						if (!isActive) onHover(event.currentTarget);
					}}
					onMouseLeave={onUnhover}
				>
					<button
						type="button"
						role="tab"
						id={id}
						aria-selected={isActive}
						tabIndex={isActive ? 0 : -1}
						className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-lg pr-7 pl-2.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
						onMouseDown={(event) => {
							onUnhover();
							if (event.button === 0) onSelect();
						}}
						onAuxClick={(event) => {
							if (event.button !== 1) return;
							event.preventDefault();
							onClose();
						}}
						onKeyDown={(event) => {
							if (event.key === "Delete") {
								event.preventDefault();
								onClose();
							}
						}}
					>
						<span className="flex shrink-0 items-center [&_svg]:size-3.5">
							{icon}
						</span>
						<OverflowFadeText className="flex-1 text-left">
							{label}
						</OverflowFadeText>
					</button>
					<button
						type="button"
						aria-label={t({ message: `Close ${label} tab` })}
						tabIndex={-1}
						className={cn(
							"absolute right-1.5 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-fill-hover hover:text-foreground",
							isActive
								? "opacity-100"
								: "pointer-events-none opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100",
						)}
						onMouseDown={(event) => event.preventDefault()}
						onClick={onClose}
					>
						<LuX className="size-3.5" />
					</button>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				{menuItems && (
					<>
						{menuItems}
						<ContextMenuSeparator />
					</>
				)}
				<ContextMenuItem onSelect={onClose}>
					<LuX />
					<Trans>Close</Trans>
				</ContextMenuItem>
				<ContextMenuItem disabled={!canCloseOthers} onSelect={onCloseOthers}>
					<LuX />
					<Trans>Close other tabs</Trans>
				</ContextMenuItem>
				<ContextMenuItem disabled={!canCloseToRight} onSelect={onCloseToRight}>
					<LuX />
					<Trans>Close tabs to the right</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
