import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuFiles } from "react-icons/lu";

interface DiffTreeToggleButtonProps {
	fileCount: number;
	isCollapsed: boolean;
	onToggle: () => void;
}

/** The "Files N" pill that shows and hides a diff view's file list. */
export function DiffTreeToggleButton({
	fileCount,
	isCollapsed,
	onToggle,
}: DiffTreeToggleButtonProps) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-pressed={!isCollapsed}
			aria-label={
				isCollapsed
					? t({
							message: "Show file tree",
						})
					: t({
							message: "Hide file tree",
						})
			}
			className={cn(
				"flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors",
				isCollapsed
					? "text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					: "bg-secondary text-foreground",
			)}
		>
			<LuFiles className="size-3.5 shrink-0" strokeWidth={1.5} />
			<span className="text-[11px] font-medium">
				<Trans>Files</Trans>
			</span>
			<span
				className={cn(
					"text-[11px] tabular-nums",
					isCollapsed ? "text-muted-foreground/70" : "text-muted-foreground",
				)}
			>
				{fileCount}
			</span>
		</button>
	);
}
