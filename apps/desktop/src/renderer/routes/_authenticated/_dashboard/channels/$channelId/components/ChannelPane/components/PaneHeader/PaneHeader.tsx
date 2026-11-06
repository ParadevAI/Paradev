import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	LuChevronLeft,
	LuMaximize2,
	LuMinimize2,
	LuPanelRightClose,
} from "react-icons/lu";
import { RightPaneHeaderButton } from "renderer/routes/_authenticated/_dashboard/components/RightPaneHeaderButton";
import { WindowChrome } from "renderer/routes/_authenticated/_dashboard/components/WindowChrome";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";

interface PaneHeaderProps {
	title: ReactNode;
	/** Where "back" goes, shown as a chevron before the title. */
	onBack?: () => void;
	isFullScreen: boolean;
	onToggleFullScreen: () => void;
	onHide: () => void;
	/** Controls after the title, before expand and hide. */
	actions?: ReactNode;
	className?: string;
}

/** The pane's top row: a way back, what this page is, and the pane controls. */
export function PaneHeader({
	title,
	onBack,
	isFullScreen,
	onToggleFullScreen,
	onHide,
	actions,
	className,
}: PaneHeaderProps) {
	const { t } = useLingui();
	return (
		<div
			className={cn(
				"flex h-12 shrink-0 items-center gap-1 border-b border-border pr-2 pl-2",
				className,
			)}
		>
			{isFullScreen && <WindowChrome />}
			{onBack && (
				<button
					type="button"
					aria-label={t({ message: "Back" })}
					onClick={onBack}
					className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
				>
					<LuChevronLeft className="size-4" strokeWidth={1.75} />
				</button>
			)}
			<div className="flex min-w-0 flex-1 items-center gap-2 pl-1 text-[13px] font-semibold">
				{title}
			</div>
			<div className="flex shrink-0 items-center gap-0.5">
				{actions}
				<RightPaneHeaderButton
					label={
						isFullScreen
							? t({ message: "Restore width" })
							: t({ message: "Expand" })
					}
					hotkeyId="TOGGLE_RIGHT_PANE_FULL_SCREEN"
					onClick={onToggleFullScreen}
				>
					{isFullScreen ? (
						<LuMinimize2 className="size-4" strokeWidth={1.5} />
					) : (
						<LuMaximize2 className="size-4" strokeWidth={1.5} />
					)}
				</RightPaneHeaderButton>
				<RightPaneHeaderButton
					label={t({ message: "Hide panel" })}
					hotkeyId="TOGGLE_SIDEBAR"
					onClick={onHide}
				>
					<LuPanelRightClose className="size-4" strokeWidth={1.5} />
				</RightPaneHeaderButton>
				<WindowControlsInset />
			</div>
		</div>
	);
}
