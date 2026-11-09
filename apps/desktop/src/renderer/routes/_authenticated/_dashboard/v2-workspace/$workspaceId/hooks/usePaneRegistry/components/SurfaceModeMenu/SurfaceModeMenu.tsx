import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ChevronDown, MessageSquare, SquareTerminal } from "lucide-react";
import type { ReactNode } from "react";
import type { SurfaceForkSource } from "../../hooks/useSurfaceFork";

export function SurfaceModeMenu({
	mode,
	source,
	onFork,
	open,
	onOpenChange,
	children,
}: {
	mode: "cli" | "chat";
	source: SurfaceForkSource | null;
	onFork: (source: SurfaceForkSource) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: ReactNode;
}) {
	const { t } = useLingui();
	const modeLabel =
		mode === "cli" ? t({ message: "CLI mode" }) : t({ message: "Chat mode" });
	const ModeIcon = mode === "cli" ? SquareTerminal : MessageSquare;
	const TargetIcon = mode === "cli" ? MessageSquare : SquareTerminal;

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<button
					aria-label={modeLabel}
					className="hidden h-[22px] items-center gap-1 rounded-md border border-border/60 bg-secondary/40 px-1.5 font-medium text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground @min-[200px]/pane-header:inline-flex"
					type="button"
				>
					<ModeIcon className="size-3" />
					<span className="hidden @min-[320px]/pane-header:inline">
						{modeLabel}
					</span>
					<ChevronDown className="size-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				{source && (
					<DropdownMenuItem onSelect={() => onFork(source)}>
						<TargetIcon />
						{mode === "cli" ? (
							<Trans>Open in Chat Interface</Trans>
						) : (
							<Trans>Open in Terminal Chat</Trans>
						)}
					</DropdownMenuItem>
				)}
				{source && children && <DropdownMenuSeparator />}
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
