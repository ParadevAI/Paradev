import { Trans } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuFileText, LuPinOff } from "react-icons/lu";

interface PinnedPageRowProps {
	title: string;
	isActive: boolean;
	isCollapsed: boolean;
	onClick: () => void;
	onUnpin: () => void;
}

export function PinnedPageRow({
	title,
	isActive,
	isCollapsed,
	onClick,
	onUnpin,
}: PinnedPageRowProps) {
	const unpinMenu = (
		<ContextMenuContent>
			<ContextMenuItem onSelect={onUnpin}>
				<LuPinOff className="size-4" />
				<Trans>Unpin</Trans>
			</ContextMenuItem>
		</ContextMenuContent>
	);

	if (isCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<ContextMenu>
					<TooltipTrigger asChild>
						<ContextMenuTrigger asChild>
							<button
								type="button"
								onClick={onClick}
								aria-label={title}
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"mx-auto flex size-8 items-center justify-center rounded-md transition-colors",
									isActive
										? "bg-fill-selected text-foreground"
										: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
								)}
							>
								<LuFileText className="size-4" strokeWidth={1.5} />
							</button>
						</ContextMenuTrigger>
					</TooltipTrigger>
					{unpinMenu}
				</ContextMenu>
				<TooltipContent side="right">{title}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					onClick={onClick}
					aria-current={isActive ? "page" : undefined}
					className={cn(
						"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-normal transition-colors",
						isActive
							? "bg-fill-selected text-foreground"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
					)}
				>
					<LuFileText className="size-4 shrink-0" strokeWidth={1.5} />
					<span className="min-w-0 flex-1 truncate text-left">{title}</span>
				</button>
			</ContextMenuTrigger>
			{unpinMenu}
		</ContextMenu>
	);
}
