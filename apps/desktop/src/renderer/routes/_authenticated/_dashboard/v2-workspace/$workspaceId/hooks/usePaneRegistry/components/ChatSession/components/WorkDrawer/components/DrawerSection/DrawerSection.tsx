import { cn } from "@superset/ui/utils";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useId } from "react";

export function DrawerSection({
	stopKey,
	tabbable,
	title,
	count,
	summary,
	expanded,
	onToggle,
	banner,
	showHeader = true,
	children,
}: {
	stopKey: string;
	tabbable: boolean;
	title: string;
	count: number;
	summary?: ReactNode;
	expanded: boolean;
	onToggle: () => void;
	banner?: ReactNode;
	showHeader?: boolean;
	children: ReactNode;
}) {
	const listId = useId();
	return (
		<section>
			{showHeader && (
				<button
					aria-controls={listId}
					aria-expanded={expanded}
					className="sticky top-0 z-10 flex min-h-7 w-full items-center gap-2 rounded-md bg-[color-mix(in_oklab,var(--muted)_40%,var(--background))] px-2.5 py-0.5 text-left font-sans text-muted-foreground text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring"
					data-drawer-stop={stopKey}
					onClick={onToggle}
					tabIndex={tabbable ? 0 : -1}
					type="button"
				>
					<ChevronDown
						className={cn(
							"size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
							!expanded && "-rotate-90",
						)}
					/>
					<span className="font-medium">{title}</span>
					<span className="rounded-full bg-muted-foreground/10 px-1.5 text-[11px] text-muted-foreground tabular-nums leading-4">
						{count}
					</span>
					{!expanded && summary && (
						<span className="ml-auto flex min-w-0 items-center gap-1.5 truncate text-muted-foreground/70 text-xs">
							{summary}
						</span>
					)}
				</button>
			)}
			{(expanded || !showHeader) && (
				<>
					{banner}
					<div aria-label={title} id={listId} role="listbox">
						{children}
					</div>
				</>
			)}
		</section>
	);
}
