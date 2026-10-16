import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
import { LuCheck, LuChevronRight } from "react-icons/lu";

interface SettledLineProps {
	/** What the block was: a card's title, or a question. */
	label: ReactNode;
	/** How it ended: the action's notice, or the answer. */
	outcome: ReactNode;
	/** The block itself, read-only, shown when the line is opened. */
	children: ReactNode;
}

/** A settled block, folded to one line that says how it ended. Opening it shows the block as it was left. */
export function SettledLine({ label, outcome, children }: SettledLineProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	return (
		<div className="flex flex-col gap-2">
			<button
				type="button"
				aria-expanded={open}
				aria-label={open ? t({ message: "Fold" }) : t({ message: "Show" })}
				onClick={() => setOpen(!open)}
				className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-fill-hover"
			>
				<LuCheck className="size-3.5 shrink-0 text-success" strokeWidth={2} />
				<span className="min-w-0 shrink truncate font-medium text-foreground">
					{label}
				</span>
				<span className="min-w-0 flex-1 truncate">{outcome}</span>
				<LuChevronRight
					className={cn(
						"size-3.5 shrink-0 transition-transform",
						open && "rotate-90",
					)}
					strokeWidth={1.5}
				/>
			</button>
			{open && children}
		</div>
	);
}
