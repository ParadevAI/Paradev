import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
import { LuChevronRight, LuFolderGit2 } from "react-icons/lu";
import { DiffStatText } from "renderer/routes/_authenticated/_dashboard/components/DiffStatText";
import {
	type FoldSignal,
	isFoldCollapsed,
} from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";

interface RepositoryFolderGroupProps {
	name: string;
	additions: number;
	deletions: number;
	/** A fold action opens or closes the group, like the folders in it. */
	foldSignal: FoldSignal;
	children: ReactNode;
}

/** One repository's folders in the folders view, under a row with its totals. */
export function RepositoryFolderGroup({
	name,
	additions,
	deletions,
	foldSignal,
	children,
}: RepositoryFolderGroupProps) {
	const [toggle, setToggle] = useState<{ epoch: number; open: boolean }>();
	const open =
		toggle && toggle.epoch === foldSignal.epoch
			? toggle.open
			: !isFoldCollapsed(foldSignal);

	return (
		<div>
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setToggle({ epoch: foldSignal.epoch, open: !open })}
				className="flex w-full items-center gap-1.5 py-1 pr-3 pl-2 text-left text-xs hover:bg-accent/30"
			>
				<LuChevronRight
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-90",
					)}
				/>
				<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate font-medium">{name}</span>
				<span className="shrink-0 text-[11px] tabular-nums">
					<DiffStatText additions={additions} deletions={deletions} />
				</span>
			</button>
			{open && <div className="pl-2">{children}</div>}
		</div>
	);
}
