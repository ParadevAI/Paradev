import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	ChevronDown,
	MessageSquare,
	SquareStack,
	SquareTerminal,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
	SurfaceForkPlacement,
	SurfaceForkSource,
} from "../../hooks/useSurfaceFork";

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
	onFork: (source: SurfaceForkSource, placement: SurfaceForkPlacement) => void;
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
					<>
						<DropdownMenuItem
							className="items-start"
							onSelect={() => onFork(source, "beside")}
						>
							<TargetIcon className="mt-0.5" />
							<div className="flex flex-col gap-0.5">
								<span>
									{mode === "cli" ? (
										<Trans>Fork into chat</Trans>
									) : (
										<Trans>Fork into CLI</Trans>
									)}
								</span>
								<span className="text-[11px] text-muted-foreground">
									<Trans>Opens beside this pane. This one keeps running.</Trans>
								</span>
							</div>
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onFork(source, "tab")}>
							<SquareStack />
							{mode === "cli" ? (
								<Trans>Fork into chat in a new tab</Trans>
							) : (
								<Trans>Fork into CLI in a new tab</Trans>
							)}
						</DropdownMenuItem>
					</>
				)}
				{source && children && <DropdownMenuSeparator />}
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
