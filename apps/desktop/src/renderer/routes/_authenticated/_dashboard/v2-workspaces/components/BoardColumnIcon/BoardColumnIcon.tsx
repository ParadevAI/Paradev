import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { cn } from "@superset/ui/utils";
import { GoGitPullRequest } from "react-icons/go";
import { LuArchive, LuCircleCheck } from "react-icons/lu";
import type { BoardColumnKey } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";

interface BoardColumnIconProps {
	column: BoardColumnKey;
	className?: string;
}

/**
 * Group-header status icon shared by the board columns and the list's
 * status sections. Same vocabulary as the cloud tab's row status
 * (CloudWorkspaceStatus): dots for waiting states, the wave for work in
 * progress. Every variant sits in one 12px box so headers line up.
 */
export function BoardColumnIcon({ column, className }: BoardColumnIconProps) {
	return (
		<span
			aria-hidden
			className={cn(
				"flex size-3 shrink-0 items-center justify-center",
				className,
			)}
		>
			<BoardColumnGlyph column={column} />
		</span>
	);
}

function BoardColumnGlyph({ column }: { column: BoardColumnKey }) {
	switch (column) {
		case "attention":
			return <span className="size-2 rounded-full bg-yellow-500" />;
		case "working":
			return <WaveSpinner className="text-amber-500" />;
		case "finished":
			return <span className="size-2 rounded-full bg-success" />;
		case "review":
			return <GoGitPullRequest className="size-3 text-sky-500" />;
		case "merged":
			return <LuCircleCheck className="size-3 text-violet-500" />;
		case "deleted":
			return <LuArchive className="size-3 text-muted-foreground/70" />;
		default:
			return (
				<span className="size-2 rounded-full border border-dashed border-muted-foreground/60" />
			);
	}
}
